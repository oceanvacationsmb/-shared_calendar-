const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_REPORT_API_KEY = process.env.GUESTY_REPORT_API_KEY;

const REPORT_API_URL = "https://report.guesty.com/api/shared-reservations-reports";
const TIMEZONE = "America/New_York";
const DAYS_TO_SHOW = 14;
const PAGE_LIMIT = 100;

function cleanReportKey() {
  return String(GUESTY_REPORT_API_KEY || "")
    .replace("apiKey=", "")
    .replace("apikey=", "")
    .trim();
}

function todayString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function overlapsRange(checkIn, checkOut, start, end) {
  return checkIn < end && checkOut > start;
}

async function fetchReportPage(skip = 0, limit = PAGE_LIMIT) {
  const key = cleanReportKey();

  const url =
    `${REPORT_API_URL}?timezone=${encodeURIComponent(TIMEZONE)}` +
    `&skip=${skip}` +
    `&limit=${limit}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      authorization: key,
      referer: `https://report.guesty.com/apps/reservations?apiKey=${encodeURIComponent(key)}`,
      "user-agent": "Mozilla/5.0"
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

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      data
    }));
  }

  return data;
}

function findReservationArrays(obj, found = []) {
  if (!obj || typeof obj !== "object") return found;

  if (Array.isArray(obj)) {
    const looksLikeReservations = obj.some(item => {
      if (!item || typeof item !== "object") return false;

      return Boolean(
        item.checkInDate ||
        item.checkOutDate ||
        item["checkInDate"] ||
        item["checkOutDate"] ||
        item["listing.nickname"] ||
        item.listingId ||
        item.status
      );
    });

    if (looksLikeReservations) {
      found.push(obj);
    }

    obj.forEach(item => findReservationArrays(item, found));
    return found;
  }

  Object.values(obj).forEach(value => findReservationArrays(value, found));
  return found;
}

function extractRowsFromReport(rawData) {
  if (Array.isArray(rawData)) return rawData;

  const direct =
    rawData?.data ||
    rawData?.results ||
    rawData?.reservations ||
    rawData?.items ||
    rawData?.rows;

  if (Array.isArray(direct)) return direct;

  const arrays = findReservationArrays(rawData);

  if (!arrays.length) return [];

  arrays.sort((a, b) => b.length - a.length);
  return arrays[0];
}

function getField(row, key) {
  const value = row?.[key];

  if (value && typeof value === "object") {
    return (
      value.children ??
      value.value ??
      value.text ??
      value.label ??
      value.id ??
      null
    );
  }

  return value ?? null;
}

function cleanDate(value) {
  if (!value) return null;
  return String(value).substring(0, 10);
}

function normalizeReservation(row) {
  const status = String(
    getField(row, "status") ||
    row?.status ||
    ""
  ).toLowerCase();

  const listingId =
    getField(row, "listingId") ||
    getField(row, "listing._id") ||
    row?.listingId ||
    row?.listing?._id ||
    row?.listing?.id ||
    null;

  const nickname =
    getField(row, "listing.nickname") ||
    getField(row, "listingNickname") ||
    getField(row, "nickname") ||
    row?.listing?.nickname ||
    row?.listing?.title ||
    row?.listing?.name ||
    listingId ||
    "Property";

  const checkIn =
    cleanDate(getField(row, "checkInDate") || row?.checkInDate || row?.checkIn);

  const checkOut =
    cleanDate(getField(row, "checkOutDate") || row?.checkOutDate || row?.checkOut);

  return {
    status,
    listingId,
    nickname,
    checkIn,
    checkOut
  };
}

async function fetchAllReportReservations() {
  const allRows = [];
  let skip = 0;

  for (let i = 0; i < 20; i++) {
    const rawPage = await fetchReportPage(skip, PAGE_LIMIT);
    const rows = extractRowsFromReport(rawPage);

    if (!rows.length) break;

    allRows.push(...rows);

    if (rows.length < PAGE_LIMIT) break;

    skip += PAGE_LIMIT;
  }

  return allRows;
}

function buildPropertiesFromReservations(reservations, start, end) {
  const map = new Map();

  reservations.forEach(res => {
    if (!res.listingId || !res.nickname) return;

    if (!map.has(res.listingId)) {
      map.set(res.listingId, {
        listingId: res.listingId,
        nickname: res.nickname,
        name: res.nickname,
        bookings: []
      });
    }

    if (
      res.status === "confirmed" &&
      res.checkIn &&
      res.checkOut &&
      overlapsRange(res.checkIn, res.checkOut, start, end)
    ) {
      map.get(res.listingId).bookings.push({
        checkIn: res.checkIn,
        checkOut: res.checkOut
      });
    }
  });

  const properties = Array.from(map.values());

  properties.forEach(property => {
    property.bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    property.days = buildDailyEvents(property.bookings, start, end);
  });

  properties.sort((a, b) => String(a.nickname).localeCompare(String(b.nickname)));

  return properties;
}

function buildDailyEvents(bookings, from, to) {
  const days = [];
  let date = from;

  while (date < to) {
    const checkout = bookings.find(b => b.checkOut === date);
    const checkin = bookings.find(b => b.checkIn === date);
    const stay = bookings.find(b => date > b.checkIn && date < b.checkOut);

    const events = [];

    if (checkout) {
      events.push({
        date,
        type: "checkout",
        label: "Checkout"
      });
    }

    if (checkin) {
      events.push({
        date,
        type: "checkin",
        label: "Check-in"
      });
    }

    if (!checkout && !checkin && stay) {
      events.push({
        date,
        type: "stay",
        label: "Guest stay"
      });
    }

    days.push({
      date,
      events
    });

    date = addDays(date, 1);
  }

  return days;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-report-api", async (req, res) => {
  try {
    if (!cleanReportKey()) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_REPORT_API_KEY"
      });
    }

    const rawPage = await fetchReportPage(0, 5);
    const rows = extractRowsFromReport(rawPage);
    const reservations = rows.map(normalizeReservation);

    res.json({
      ok: true,
      count: rows.length,
      sample: reservations
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

app.get("/api/shared-calendar", async (req, res) => {
  try {
    if (!cleanReportKey()) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_REPORT_API_KEY"
      });
    }

    const start = req.query.start || todayString();
    const end = req.query.end || addDays(start, DAYS_TO_SHOW);

    const rows = await fetchAllReportReservations();
    const reservations = rows.map(normalizeReservation);

    const confirmed = reservations.filter(res =>
      res.status === "confirmed" &&
      res.checkIn &&
      res.checkOut &&
      res.listingId
    );

    const properties = buildPropertiesFromReservations(reservations, start, end);

    res.json({
      ok: true,
      source: "guesty-report",
      start,
      end,
      totalReservations: reservations.length,
      confirmedReservations: confirmed.length,
      count: properties.length,
      properties
    });
  } catch (err) {
    console.error("Shared calendar error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Shared calendar failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
