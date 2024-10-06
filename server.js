const express = require("express");
const axios = require("axios");
const storage = require("node-persist");
const crypto = require("crypto");
const qs = require("querystring");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize storage
storage.init();

const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;
const YAHOO_REDIRECT_URI = process.env.YAHOO_REDIRECT_URI;

// Function to get new access token using refresh token
async function refreshAccessToken(refreshToken) {
  const response = await axios.post(
    "https://api.login.yahoo.com/oauth2/get_token",
    qs.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: YAHOO_CLIENT_ID,
      client_secret: YAHOO_CLIENT_SECRET,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
}

// Middleware to check and refresh token if necessary
app.use(async (req, res, next) => {
  let tokenData = await storage.getItem("yahooToken");

  if (!tokenData) {
    return res.redirect("/auth");
  }

  if (Date.now() > tokenData.expiresAt) {
    try {
      const newTokenData = await refreshAccessToken(tokenData.refreshToken);
      tokenData = {
        accessToken: newTokenData.access_token,
        refreshToken: newTokenData.refresh_token,
        expiresAt: Date.now() + newTokenData.expires_in * 1000,
      };
      await storage.setItem("yahooToken", tokenData);
    } catch (error) {
      console.error("Error refreshing token:", error);
      return res.redirect("/auth");
    }
  }

  req.yahooToken = tokenData.accessToken;
  next();
});

app.get("/auth", (req, res) => {
  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${YAHOO_CLIENT_ID}&redirect_uri=${YAHOO_REDIRECT_URI}&response_type=code&language=en-us`;
  res.redirect(authUrl);
});

app.get("/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post(
      "https://api.login.yahoo.com/oauth2/get_token",
      qs.stringify({
        grant_type: "authorization_code",
        client_id: YAHOO_CLIENT_ID,
        client_secret: YAHOO_CLIENT_SECRET,
        code: code,
        redirect_uri: YAHOO_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const tokenData = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    await storage.setItem("yahooToken", tokenData);
    res.send("Authentication successful! You can now use the Fantasy API.");
  } catch (error) {
    console.error("Error getting token:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/*", async (req, res) => {
  try {
    const response = await axios.get(
      `https://fantasysports.yahooapis.com/fantasy/v2${req.path.substring(4)}${
        req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
      }`,
      {
        headers: {
          Authorization: `Bearer ${req.yahooToken}`,
        },
      }
    );
    res.send(response.data);
  } catch (error) {
    console.error("API request failed:", error);
    res.status(500).send("API request failed");
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
