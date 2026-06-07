const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const GUESTY_CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

async function getGuestyToken() {
  const response = await fetch("https://open-api.guesty.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: GUESTY_CLIENT_ID,
      client_secret: GUESTY_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.log("Guesty token error:", data);
    throw new Error(data.error_description || data.message || "Guesty token failed");
  }

  return data.access_token;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-guesty-auth", async (req, res) => {
  try {
    if (!GUESTY_CLIENT_ID || !GUESTY_CLIENT_SECRET) {
      return res.status(500).json({
        ok: false,
        message: "Missing Guesty environment variables"
      });
    }

    const token = await getGuestyToken();

    res.json({
      ok: true,
      message: "Guesty auth connected",
      tokenPreview: token ? token.substring(0, 12) + "..." : null
    });
  } catch (err) {
    console.error("Guesty auth test error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Guesty auth failed"
    });
  }
});

app.get("/api/shared-calendar", async (req, res) => {
  const { start, end } = req.query;

  res.json({
    ok: true,
    start: start || null,
    end: end || null,
    properties: [
      {
        name: "Test Property",
        bookings: [
          {
            checkIn: "2026-06-10",
            checkOut: "2026-06-14"
          }
        ]
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
