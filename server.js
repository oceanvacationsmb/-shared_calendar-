const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_REPORT_API_KEY = process.env.GUESTY_REPORT_API_KEY;

const REPORT_APP_URL = "https://report.guesty.com/apps/reservations";
const REPORT_API_URL =
  "https://report.guesty.com/api/shared-reservations-reports?timezone=America/New_York&skip=0&limit=100";

function cleanApiKey() {
  return String(GUESTY_REPORT_API_KEY || "")
    .replace("apiKey=", "")
    .replace("apikey=", "")
    .trim();
}

async function getCookiesFromGuestyApp() {
  const apiKey = cleanApiKey();

  const response = await fetch(`${REPORT_APP_URL}?apiKey=${encodeURIComponent(apiKey)}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0"
    }
  });

  const rawSetCookie = response.headers.get("set-cookie");

  return {
    status: response.status,
    setCookie: rawSetCookie || "",
    cookieHeader: rawSetCookie
      ? rawSetCookie
          .split(",")
          .map(part => part.split(";")[0].trim())
          .join("; ")
      : ""
  };
}

async function fetchReportWithCookies(cookieHeader) {
  const response = await fetch(REPORT_API_URL, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0",
      "referer": `${REPORT_APP_URL}?apiKey=${encodeURIComponent(cleanApiKey())}`,
      "origin": "https://report.guesty.com",
      "cookie": cookieHeader
    }
  });

  let data;

  try {
    data = await response.json();
  } catch (err) {
    data = {
      rawText: await response.text().catch(() => "")
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-report-cookie", async (req, res) => {
  try {
    if (!GUESTY_REPORT_API_KEY) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_REPORT_API_KEY in Render"
      });
    }

    const cookieResult = await getCookiesFromGuestyApp();
    const reportResult = await fetchReportWithCookies(cookieResult.cookieHeader);

    res.json({
      ok: true,
      message: "Cookie report test completed",
      appOpenStatus: cookieResult.status,
      hasCookie: Boolean(cookieResult.cookieHeader),
      cookiePreview: cookieResult.cookieHeader
        ? cookieResult.cookieHeader.substring(0, 80) + "..."
        : null,
      reportResult
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message || "Report cookie test failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
