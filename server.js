const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_REPORT_API_KEY = process.env.GUESTY_REPORT_API_KEY;

async function fetchReportWithMethod(methodName, options) {
  const baseUrl =
    "https://report.guesty.com/api/shared-reservations-reports?timezone=America/New_York&skip=0&limit=100";

  let url = baseUrl;
  const headers = {
    accept: "application/json"
  };

  if (options.queryKey) {
    url += `&${options.queryKey}=${encodeURIComponent(GUESTY_REPORT_API_KEY)}`;
  }

  if (options.headerKey) {
    headers[options.headerKey] = GUESTY_REPORT_API_KEY;
  }

  if (options.bearer) {
    headers.authorization = `Bearer ${GUESTY_REPORT_API_KEY}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers
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
    methodName,
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

app.get("/api/test-report-api", async (req, res) => {
  try {
    if (!GUESTY_REPORT_API_KEY) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_REPORT_API_KEY in Render"
      });
    }

    const tests = [];

    tests.push(await fetchReportWithMethod("query_apiKey", {
      queryKey: "apiKey"
    }));

    tests.push(await fetchReportWithMethod("query_apikey", {
      queryKey: "apikey"
    }));

    tests.push(await fetchReportWithMethod("header_x_api_key", {
      headerKey: "x-api-key"
    }));

    tests.push(await fetchReportWithMethod("header_apiKey", {
      headerKey: "apiKey"
    }));

    tests.push(await fetchReportWithMethod("header_apikey", {
      headerKey: "apikey"
    }));

    tests.push(await fetchReportWithMethod("bearer_token", {
      bearer: true
    }));

    res.json({
      ok: true,
      message: "Report API test completed",
      tests
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message || "Report API test failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
