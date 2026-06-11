const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "75mb" }));

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

const GUESTY_REPORT_API_KEY = process.env.GUESTY_REPORT_API_KEY;
const GUESTY_ALL_REPORT_API_KEY = process.env.GUESTY_ALL_REPORT_API_KEY;

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TASK_MEDIA_BUCKET = process.env.TASK_MEDIA_BUCKET || "calendar-task-media";
const LOCKS_API_CLIENT = process.env.LOCKS_API_CLIENT;
const LOCKS_API_SECRET = process.env.LOCKS_API_SECRET;
const LOCKS_API_BEARER = process.env.LOCKS_API_BEARER || process.env.LOCKS_API_TOKEN || "";
const LOCKS_API_COOKIE = process.env.LOCKS_API_COOKIE || "";
const LOCKS_API_URL = process.env.LOCKS_API_URL || process.env.LOCKS_API_BASE_URL || "";
const GAPS_API_URL = String(process.env.GAPS_API_URL || process.env.GUESTY_GAPS_URL || "").replace(/\/$/, "");
const GAPS_ADMIN_KEY = process.env.GAPS_ADMIN_KEY || process.env.SETTINGS_ADMIN_KEY || "";

const REPORT_API_URL = "https://report.guesty.com/api/shared-reservations-reports";
const TIMEZONE = "America/New_York";
const DAYS_TO_SHOW = 90;
const PAGE_LIMIT = 100;
const LOCKS_CACHE_MS = 15 * 60 * 1000;

let locksCache = {
  expiresAt: 0,
  data: []
};

function gapsHeaders() {
  const headers = {
    accept: "application/json"
  };

  if (GAPS_ADMIN_KEY) {
    headers["x-admin-key"] = GAPS_ADMIN_KEY;
  }

  return headers;
}

async function gapsRequest(path, options = {}) {
  if (!GAPS_API_URL) {
    const err = new Error("Missing GAPS_API_URL");
    err.statusCode = 500;
    throw err;
  }

  if (!GAPS_ADMIN_KEY) {
    const err = new Error("Missing GAPS_ADMIN_KEY");
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch(`${GAPS_API_URL}${path}`, {
    ...options,
    headers: {
      ...gapsHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const err = new Error(data.error || data.message || `Gaps API failed (${response.status})`);
    err.statusCode = response.status;
    throw err;
  }

  return data;
}

function cleanReportKey(key) {
  return String(key || "")
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

async function fetchReportPage(reportKey, skip = 0, limit = PAGE_LIMIT) {
  const key = cleanReportKey(reportKey);

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

function cleanPhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function collectReportText(value, parts = []) {
  if (value === null || value === undefined) return parts;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return parts;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectReportText(item, parts));
    return parts;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      parts.push(String(key));
      collectReportText(entry, parts);
    });
  }

  return parts;
}

function hasPaymentIssue(row) {
  const text = collectReportText(row).join(" ").toLowerCase();

  return [
    "payment failed",
    "failed payment",
    "payment issue",
    "payment error",
    "payment declined",
    "card declined",
    "charge failed",
    "transaction failed",
    "payment unsuccessful",
    "failed to charge",
    "past due",
    "unpaid"
  ].some(term => text.includes(term));
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

  const listingCity =
    getField(row, "listing.address.city") ||
    getField(row, "listing.city") ||
    getField(row, "address.city") ||
    row?.listing?.address?.city ||
    row?.listing?.city ||
    row?.address?.city ||
    "";

  const guestName =
    getField(row, "guest.fullName") ||
    getField(row, "guest.name") ||
    getField(row, "guestFullName") ||
    getField(row, "guestName") ||
    row?.guest?.fullName ||
    row?.guest?.name ||
    "Guest";

  const guestPhone =
    cleanPhone(
      getField(row, "guest.phone") ||
      getField(row, "guest.phoneNumber") ||
      getField(row, "guestPhone") ||
      getField(row, "phone") ||
      row?.guest?.phone ||
      row?.guest?.phoneNumber ||
      ""
    );

  const checkIn =
    cleanDate(getField(row, "checkInDate") || row?.checkInDate || row?.checkIn);

  const checkOut =
    cleanDate(getField(row, "checkOutDate") || row?.checkOutDate || row?.checkOut);

  const elevatorRaw = getField(row, "customFields.69682ec2a604dc001460d3c5");

  const elevator = String(elevatorRaw || "").trim().toLowerCase() === "yes";
  const confPmt = hasPaymentIssue(row);

  return {
    status,
    listingId,
    nickname,
    listingCity,
    guestName,
    guestPhone,
    checkIn,
    checkOut,
    elevator,
    confPmt
  };
}

async function fetchAllReportReservations(reportKey) {
  const allRows = [];
  let skip = 0;

  for (let i = 0; i < 50; i++) {
    const rawPage = await fetchReportPage(reportKey, skip, PAGE_LIMIT);
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
        city: res.listingCity || "",
        listingCity: res.listingCity || "",
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
        checkOut: res.checkOut,
        elevator: res.elevator,
        confPmt: res.confPmt,
        guestName: res.guestName,
        guestPhone: res.guestPhone,
        listingCity: res.listingCity
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

async function buildCalendarResponse(reportKey, req) {
  const cleanKey = cleanReportKey(reportKey);

  if (!cleanKey) {
    return {
      ok: false,
      statusCode: 500,
      body: {
        ok: false,
        message: "Missing Guesty report API key"
      }
    };
  }

  const start = req.query.start || todayString();
  const end = req.query.end || addDays(start, DAYS_TO_SHOW);

  const rows = await fetchAllReportReservations(cleanKey);
  const reservations = rows.map(normalizeReservation);

  const confirmed = reservations.filter(res =>
    res.status === "confirmed" &&
    res.checkIn &&
    res.checkOut &&
    res.listingId
  );

  const properties = buildPropertiesFromReservations(reservations, start, end);

  return {
    ok: true,
    statusCode: 200,
    body: {
      ok: true,
      source: "guesty-report",
      start,
      end,
      totalReservations: reservations.length,
      confirmedReservations: confirmed.length,
      count: properties.length,
      properties
    }
  };
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
}

async function supabaseRequest(path, options = {}) {
  requireSupabase();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      data
    }));
  }

  return data;
}

async function supabaseStorageRequest(path, options = {}) {
  requireSupabase();

  const response = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      data
    }));
  }

  return data;
}

function getDefaultTaskVendors() {
  return [
    "Andre",
    "Ashley",
    "Isaac",
    "Dennis",
    "Paradise HVAC",
    "Stainley"
  ];
}

function getDefaultTaskCreators() {
  return [
    "Zack",
    "Isaac",
    "Ashley"
  ];
}

function sanitizeFileName(value) {
  return String(value || "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid upload data");
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function publicStorageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${TASK_MEDIA_BUCKET}/${path}`;
}

function normalizeTextKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(mb|gc|gcssb|ssb|nmb|mi)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeLockItem(item) {
  const propertyName =
    item.propertyName ||
    item.property?.nickname ||
    item.property?.name ||
    item.listing?.nickname ||
    item.listing?.name ||
    item.listings?.[0]?.nickname ||
    item.listings?.[0]?.name ||
    item.listingName ||
    item.linkedListing?.nickname ||
    item.linkedListing?.name ||
    item.doorLock ||
    "";

  const batteryRaw =
    item.batteryLevel ??
    item.battery ??
    item.batteryPercent ??
    item.batteryPercentage ??
    item.status?.batteryLevel;

  let batteryPercent = null;

  if (typeof batteryRaw === "number") {
    batteryPercent = batteryRaw <= 1 ? Math.round(batteryRaw * 100) : Math.round(batteryRaw);
  } else if (batteryRaw) {
    const match = String(batteryRaw).match(/\d+/);
    batteryPercent = match ? Number(match[0]) : null;
  }

  const batteryStatus = batteryPercent === null
    ? String(item.batteryStatus || item.battery || "").trim()
    : "";

  return {
    id: item.id || item._id || item.referenceId || "",
    lockName: item.name || item.lockName || item.title || "",
    propertyName,
    propertyKey: normalizeTextKey(propertyName),
    batteryPercent,
    batteryStatus,
    online: Boolean(item.online ?? item.isOnline ?? item.status?.online),
    provider: item.providerDisplayName || item.provider || item.providerName || ""
  };
}

function extractLockItems(data) {
  if (Array.isArray(data)) return data;

  const direct =
    data?.locks ||
    data?.results ||
    data?.items ||
    data?.data ||
    data?.rows;

  if (Array.isArray(direct)) return direct;

  const seen = new Set();
  const stack = [data];

  while (stack.length) {
    const value = stack.pop();

    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        const hasLocks = child.some(item => item && typeof item === "object" && (
          "batteryLevel" in item ||
          "online" in item ||
          "doorLock" in item ||
          "providerDisplayName" in item ||
          Array.isArray(item.listings)
        ));

        if (hasLocks) return child;
      } else if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return [];
}

async function fetchLocksFromConfiguredApi() {
  if (!LOCKS_API_URL) return [];

  const headers = {
    accept: "application/json"
  };

  if (LOCKS_API_BEARER) {
    const token = String(LOCKS_API_BEARER).replace(/^Bearer\s+/i, "").trim();
    headers.authorization = `Bearer ${token}`;
  } else if (LOCKS_API_CLIENT && LOCKS_API_SECRET) {
    headers.authorization = `Basic ${Buffer.from(`${LOCKS_API_CLIENT}:${LOCKS_API_SECRET}`).toString("base64")}`;
  }

  if (LOCKS_API_COOKIE) {
    headers.cookie = LOCKS_API_COOKIE;
  }

  const response = await fetch(LOCKS_API_URL, {
    method: "GET",
    headers
  });
  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Locks API failed (${response.status}): ${text}`);
  }

  return extractLockItems(data).map(normalizeLockItem).filter(item => item.propertyKey);
}

async function saveTaskMedia(taskId, files = [], uploadedFor = "open") {
  if (!taskId || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  const saved = [];

  for (const file of files) {
    if (!file?.dataUrl) continue;

    const parsed = parseDataUrl(file.dataUrl);
    const originalName = sanitizeFileName(file.name);
    const mediaKind = String(file.type || parsed.contentType).startsWith("video/")
      ? "video"
      : "image";
    const storagePath = `${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${originalName}`;

    await supabaseStorageRequest(
      `object/${encodeURIComponent(TASK_MEDIA_BUCKET)}/${storagePath}`,
      {
        method: "PUT",
        headers: {
          "content-type": parsed.contentType,
          "x-upsert": "true"
        },
        body: parsed.buffer
      }
    );

    const inserted = await supabaseRequest(
      "calendar_task_media",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          task_id: String(taskId),
          file_name: originalName,
          file_type: parsed.contentType,
          file_url: publicStorageUrl(storagePath),
          storage_path: storagePath,
          media_kind: mediaKind,
          uploaded_for: uploadedFor
        })
      }
    );

    saved.push(Array.isArray(inserted) ? inserted[0] : inserted);
  }

  return saved;
}

async function cleanupOldCompletedTasks() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const oldTasks = await supabaseRequest(
      `calendar_tasks?status=eq.completed&completed_at=lt.${encodeURIComponent(cutoff)}&select=id`,
      {
        method: "GET"
      }
    );

    const ids = (oldTasks || []).map(task => String(task.id)).filter(Boolean);

    if (!ids.length) return;

    const idList = ids.join(",");
    const oldMedia = await supabaseRequest(
      `calendar_task_media?task_id=in.(${encodeURIComponent(idList)})&select=storage_path`,
      {
        method: "GET"
      }
    );
    const storagePaths = (oldMedia || []).map(item => item.storage_path).filter(Boolean);

    if (storagePaths.length) {
      await supabaseStorageRequest(
        `object/${encodeURIComponent(TASK_MEDIA_BUCKET)}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            prefixes: storagePaths
          })
        }
      ).catch(err => {
        console.error("Completed task storage cleanup error:", err);
      });

      await supabaseRequest(
        `calendar_task_media?task_id=in.(${encodeURIComponent(idList)})`,
        {
          method: "DELETE"
        }
      );
    }

    await supabaseRequest(
      `calendar_tasks?status=eq.completed&completed_at=lt.${encodeURIComponent(cutoff)}`,
      {
        method: "DELETE"
      }
    );
  } catch (err) {
    console.error("Completed task cleanup error:", err);
  }
}

async function deleteTaskPermanently(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return;

  const media = await supabaseRequest(
    `calendar_task_media?task_id=eq.${encodeURIComponent(id)}&select=storage_path`,
    {
      method: "GET"
    }
  );
  const storagePaths = (media || []).map(item => item.storage_path).filter(Boolean);

  if (storagePaths.length) {
    await supabaseStorageRequest(
      `object/${encodeURIComponent(TASK_MEDIA_BUCKET)}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          prefixes: storagePaths
        })
      }
    ).catch(err => {
      console.error("Task storage delete error:", err);
    });
  }

  await supabaseRequest(
    `calendar_task_media?task_id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );

  await supabaseRequest(
    `calendar_tasks?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-report-api", async (req, res) => {
  try {
    const key = cleanReportKey(GUESTY_REPORT_API_KEY);

    if (!key) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_REPORT_API_KEY"
      });
    }

    const rawPage = await fetchReportPage(key, 0, 5);
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

app.get("/api/test-calendar-all", async (req, res) => {
  try {
    const key = cleanReportKey(GUESTY_ALL_REPORT_API_KEY);

    if (!key) {
      return res.status(500).json({
        ok: false,
        message: "Missing GUESTY_ALL_REPORT_API_KEY"
      });
    }

    const rawPage = await fetchReportPage(key, 0, 5);
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
    const result = await buildCalendarResponse(GUESTY_REPORT_API_KEY, req);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error("Shared calendar error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Shared calendar failed"
    });
  }
});

app.get("/api/calendar-all", async (req, res) => {
  try {
    const result = await buildCalendarResponse(GUESTY_ALL_REPORT_API_KEY, req);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error("Calendar all error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Calendar all failed"
    });
  }
});

app.get("/api/locks-status", async (req, res) => {
  try {
    if (Date.now() < locksCache.expiresAt) {
      return res.json({
        ok: true,
        cached: true,
        locks: locksCache.data
      });
    }

    const locks = await fetchLocksFromConfiguredApi();

    locksCache = {
      expiresAt: Date.now() + LOCKS_CACHE_MS,
      data: locks
    };

    res.json({
      ok: true,
      cached: false,
      locks
    });
  } catch (err) {
    console.error("Locks status error:", err);

    res.json({
      ok: true,
      warning: err.message || "Failed to load locks",
      locks: locksCache.data || []
    });
  }
});

app.get("/api/gaps/enabled-listings", async (req, res) => {
  try {
    const data = await gapsRequest("/api/enabled-listings");
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error("Gaps enabled listings error:", err);

    res.status(err.statusCode || 500).json({
      ok: false,
      message: err.message || "Failed to load enabled gap properties"
    });
  }
});

app.post("/api/gaps/scan", async (req, res) => {
  try {
    const data = await gapsRequest("/api/scan", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: "{}"
    });
    res.status(202).json({ ok: true, ...data });
  } catch (err) {
    console.error("Gaps scan start error:", err);

    res.status(err.statusCode || 500).json({
      ok: false,
      message: err.message || "Failed to start gap scan"
    });
  }
});

app.get("/api/gaps/scan-status", async (req, res) => {
  try {
    const data = await gapsRequest("/api/scan-status");
    res.json({ ok: true, job: data });
  } catch (err) {
    console.error("Gaps scan status error:", err);

    res.status(err.statusCode || 500).json({
      ok: false,
      message: err.message || "Failed to load gap scan status"
    });
  }
});

/* TASK API */

app.get("/api/calendar-task-vendors", async (req, res) => {
  try {
    const vendors = await supabaseRequest(
      "calendar_task_vendors?select=*&order=name.asc",
      {
        method: "GET"
      }
    );

    res.json({
      ok: true,
      vendors: vendors || []
    });
  } catch (err) {
    console.error("Get task vendors error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to load task vendors",
      defaultVendors: getDefaultTaskVendors()
    });
  }
});

app.post("/api/calendar-task-vendors", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Missing vendor name"
      });
    }

    const created = await supabaseRequest(
      "calendar_task_vendors?on_conflict=name",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation,resolution=merge-duplicates"
        },
        body: JSON.stringify({ name })
      }
    );

    res.json({
      ok: true,
      vendor: Array.isArray(created) ? created[0] : created
    });
  } catch (err) {
    console.error("Create task vendor error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to save vendor"
    });
  }
});

app.get("/api/calendar-task-creators", async (req, res) => {
  try {
    const creators = await supabaseRequest(
      "calendar_task_creators?select=*&order=name.asc",
      {
        method: "GET"
      }
    );

    res.json({
      ok: true,
      creators: creators || []
    });
  } catch (err) {
    console.error("Get task creators error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to load task creators",
      defaultCreators: getDefaultTaskCreators()
    });
  }
});

app.post("/api/calendar-task-creators", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Missing name"
      });
    }

    const created = await supabaseRequest(
      "calendar_task_creators?on_conflict=name",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation,resolution=merge-duplicates"
        },
        body: JSON.stringify({ name })
      }
    );

    res.json({
      ok: true,
      creator: Array.isArray(created) ? created[0] : created
    });
  } catch (err) {
    console.error("Create task creator error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to save name"
    });
  }
});

app.patch("/api/calendar-task-creators/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const name = String(req.body.name || "").trim();

    if (!id || !name) {
      return res.status(400).json({
        ok: false,
        message: "Missing name"
      });
    }

    const updated = await supabaseRequest(
      `calendar_task_creators?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({ name })
      }
    );

    res.json({
      ok: true,
      creator: Array.isArray(updated) ? updated[0] : updated
    });
  } catch (err) {
    console.error("Update task creator error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to update name"
    });
  }
});

app.delete("/api/calendar-task-creators/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "Missing name id"
      });
    }

    await supabaseRequest(
      `calendar_task_creators?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    res.json({
      ok: true,
      deleted: id
    });
  } catch (err) {
    console.error("Delete task creator error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to delete name"
    });
  }
});

app.get("/api/calendar-tasks", async (req, res) => {
  try {
    await cleanupOldCompletedTasks();

    const status = req.query.status === "completed" ? "completed" : "open";
    const orderColumn = status === "completed" ? "completed_at" : "created_at";
    const [tasks, media] = await Promise.all([
      supabaseRequest(
        `calendar_tasks?status=eq.${status}&select=*&order=${orderColumn}.desc.nullslast`,
        {
          method: "GET"
        }
      ),
      supabaseRequest(
        "calendar_task_media?select=*&order=created_at.asc",
        {
          method: "GET"
        }
      )
    ]);

    const mediaByTask = new Map();

    (media || []).forEach(item => {
      const key = String(item.task_id);
      const list = mediaByTask.get(key) || [];
      list.push(item);
      mediaByTask.set(key, list);
    });

    const tasksWithMedia = (tasks || []).map(task => ({
      ...task,
      media: mediaByTask.get(String(task.id)) || []
    }));

    res.json({
      ok: true,
      tasks: tasksWithMedia
    });
  } catch (err) {
    console.error("Get tasks error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to load tasks"
    });
  }
});

app.patch("/api/calendar-tasks/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const taskText = String(req.body.taskText || "").trim();
    const assigneeName = String(req.body.assigneeName || "").trim();
    const createdByName = String(req.body.createdByName || "").trim();

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "Missing task id"
      });
    }

    if (!taskText) {
      return res.status(400).json({
        ok: false,
        message: "Missing task text"
      });
    }

    const updated = await supabaseRequest(
      `calendar_tasks?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          task_text: taskText,
          assignee_name: assigneeName || null,
          created_by_name: createdByName || null
        })
      }
    );

    res.json({
      ok: true,
      task: Array.isArray(updated) ? updated[0] : updated
    });
  } catch (err) {
    console.error("Update task error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to update task"
    });
  }
});

app.post("/api/calendar-tasks", async (req, res) => {
  try {
    const listingId = String(req.body.listingId || "").trim();
    const propertyName = String(req.body.propertyName || "").trim();
    const taskText = String(req.body.taskText || "").trim();
    const assigneeName = String(req.body.assigneeName || "").trim();
    const createdByName = String(req.body.createdByName || "").trim();
    const mediaFiles = Array.isArray(req.body.mediaFiles) ? req.body.mediaFiles : [];

    if (!listingId || !taskText) {
      return res.status(400).json({
        ok: false,
        message: "Missing listingId or taskText"
      });
    }

    const created = await supabaseRequest(
      "calendar_tasks",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          listing_id: listingId,
          property_name: propertyName,
          task_text: taskText,
          assignee_name: assigneeName || null,
          created_by_name: createdByName || null,
          status: "open"
        })
      }
    );

    const task = Array.isArray(created) ? created[0] : created;
    const media = await saveTaskMedia(task?.id, mediaFiles, "open");

    res.json({
      ok: true,
      task: {
        ...task,
        media
      }
    });
  } catch (err) {
    console.error("Create task error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to create task"
    });
  }
});

app.delete("/api/calendar-tasks/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const hardDelete = String(req.query.hard || "").toLowerCase() === "true";

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "Missing task id"
      });
    }

    if (hardDelete) {
      await deleteTaskPermanently(id);

      return res.json({
        ok: true,
        deleted: id
      });
    }

    const existing = await supabaseRequest(
      `calendar_tasks?id=eq.${encodeURIComponent(id)}&select=*`,
      {
        method: "GET"
      }
    );
    const completedByName = Array.isArray(existing) && existing[0]?.assignee_name
      ? existing[0].assignee_name
      : null;

    const updated = await supabaseRequest(
      `calendar_tasks?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by_name: completedByName
        })
      }
    );

    res.json({
      ok: true,
      completed: id,
      task: Array.isArray(updated) ? updated[0] : updated
    });
  } catch (err) {
    console.error("Complete task error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Failed to complete task"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
