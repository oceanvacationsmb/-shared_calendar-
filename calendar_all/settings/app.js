const API_BASE_URL = "https://shared-calendar-api.onrender.com";
const STORAGE_KEY = "ocean_settings_admin_key";

const settingsAdminKey = document.getElementById("settingsAdminKey");
const rememberAdminKey = document.getElementById("rememberAdminKey");
const lockSnapshotJson = document.getElementById("lockSnapshotJson");
const lockTemplateBtn = document.getElementById("lockTemplateBtn");
const importLocksBtn = document.getElementById("importLocksBtn");
const lockImportStatus = document.getElementById("lockImportStatus");
const gapsClientId = document.getElementById("gapsClientId");
const gapsClientSecret = document.getElementById("gapsClientSecret");
const loadBtn = document.getElementById("loadBtn");
const saveBtn = document.getElementById("saveBtn");
const statusBox = document.getElementById("statusBox");

const reportMode = calendarBrowserData.reportMode;
if (reportMode) {
  document.getElementById("legacySettings").hidden = true;
  document.querySelector(".settings-header a").href = "../?mode=report";
}

const savedAdminKey = reportMode ? "" : localStorage.getItem(STORAGE_KEY) || "";

if (savedAdminKey) {
  settingsAdminKey.value = savedAdminKey;
  rememberAdminKey.checked = true;
}

rememberAdminKey.addEventListener("change", () => {
  if (rememberAdminKey.checked && settingsAdminKey.value.trim()) {
    localStorage.setItem(STORAGE_KEY, settingsAdminKey.value.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
});

settingsAdminKey.addEventListener("input", () => {
  if (rememberAdminKey.checked) {
    localStorage.setItem(STORAGE_KEY, settingsAdminKey.value.trim());
  }
});

loadBtn.addEventListener("click", loadCurrentSettings);
saveBtn.addEventListener("click", saveSettings);
lockTemplateBtn.addEventListener("click", loadLockTemplate);
importLocksBtn.addEventListener("click", importLockReadings);

function showLockImportStatus(message, type = "ok") {
  lockImportStatus.textContent = message;
  lockImportStatus.className = `status-box ${type}`;
}

function getCalendarProperties() {
  const properties = calendarBrowserData.read("properties", []);
  if (!properties.length) throw new Error("Open the calendar and load its property list before importing readings.");
  return properties;
}

async function loadLockTemplate() {
  if (lockSnapshotJson.value.trim() && !window.confirm("Replace the current draft with a blank property template?")) {
    return;
  }
  lockTemplateBtn.disabled = true;
  importLocksBtn.disabled = true;
  lockSnapshotJson.readOnly = true;
  try {
    const properties = getCalendarProperties();
    const locks = properties.map(property => ({
      listingId: String(property.listingId),
      propertyName: property.nickname || property.name,
      batteryPercent: null,
      batteryStatus: null,
      online: null
    }));
    lockSnapshotJson.value = JSON.stringify({ capturedAt: null, locks }, null, 2);
    showLockImportStatus("Enter the observation time and fill in the readings. Leave unread properties blank. Use lowercase battery labels in JSON.");
  } catch (err) {
    showLockImportStatus(err.message || "Unable to load the property template.", "error");
  } finally {
    lockTemplateBtn.disabled = false;
    importLocksBtn.disabled = false;
    lockSnapshotJson.readOnly = false;
  }
}

async function readLockSnapshot(input) {
  if (input.startsWith("{")) {
    let snapshot;
    try {
      snapshot = JSON.parse(input);
      snapshot.locks = snapshot.locks.flatMap(({ propertyName, ...reading }) =>
        reading.batteryPercent === null && reading.batteryStatus == null && reading.online === null ? [] : [reading]
      );
    } catch {
      throw new Error("Use a JSON snapshot with a capturedAt time and a locks array.");
    }
    return snapshot;
  }

  const [capturedAt, ...lines] = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Enter the observation time and at least one lock reading.");
  const properties = getCalendarProperties();
  const connection = new Map([["online", true], ["offline", false], ["unknown", null]]);
  const locks = lines.map((line, index) => {
    const parts = line.split("|").map(part => part.trim());
    const [property, battery, state] = parts;
    if (parts.length !== 3 || !parts.every(Boolean) || !connection.has(state.toLowerCase())) {
      throw new Error(`Reading ${index + 1} needs a property, battery, and connection separated by |.`);
    }

    const id = properties.find(item => String(item.listingId) === property);
    const lookup = property.toLowerCase();
    const matches = id ? [id] : properties.filter(item =>
      [item.nickname, item.name].some(name => {
        const fullName = name?.trim().toLowerCase();
        const displayName = fullName?.replace(/^(mb|gc|gcssb|ssb|nmb|mi)\s*[-–]\s*/, "");
        return fullName === lookup || displayName === lookup;
      })
    );
    if (matches.length !== 1) {
      throw new Error(`Reading ${index + 1} has no unique match for "${property}". Use its calendar listing ID from the property template.`);
    }

    const percent = /^(\d{1,3})%?$/.exec(battery);
    const batteryStatus = percent ? null : battery.toLowerCase();
    if (!percent && !["good", "low", "critical", "unknown"].includes(batteryStatus)) {
      throw new Error(`Reading ${index + 1} needs a battery percentage, Good, Low, Critical, or Unknown.`);
    }
    return {
      listingId: String(matches[0].listingId),
      batteryPercent: percent ? Number(percent[1]) : null,
      batteryStatus,
      online: connection.get(state.toLowerCase())
    };
  });
  return { capturedAt, locks };
}

async function importLockReadings() {
  importLocksBtn.disabled = true;
  lockTemplateBtn.disabled = true;
  lockSnapshotJson.readOnly = true;
  try {
    const snapshot = validateLockSnapshot(await readLockSnapshot(lockSnapshotJson.value.trim()));
    const saved = calendarBrowserData.read("locks", null);
    if (saved && saved.capturedAt >= snapshot.capturedAt) {
      throw new Error("A snapshot with the same or a newer observation time is already saved.");
    }
    calendarBrowserData.write("locks", snapshot);
    const { capturedAt, locks } = snapshot;
    const time = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(capturedAt));
    showLockImportStatus(`Saved ${locks.length} lock readings in this browser as of ${time} ET. Click Refresh locks on the calendar.`);
  } catch (err) {
    showLockImportStatus(err.message || "Unable to import lock readings.", "error");
  } finally {
    importLocksBtn.disabled = false;
    lockTemplateBtn.disabled = false;
    lockSnapshotJson.readOnly = false;
  }
}

function validateLockSnapshot(body) {
  // Require a real, unambiguous observation time. Round-trip catches dates like February 30.
  const timestamp = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const time = typeof body?.capturedAt === "string" && timestamp.exec(body.capturedAt);
  if (!time || !Array.isArray(body.locks) || body.locks.length < 1 || body.locks.length > 500 ||
      Object.keys(body).some(key => key !== "capturedAt" && key !== "locks")) {
    throw new Error("Provide capturedAt with a time zone and between 1 and 500 lock readings.");
  }

  const localTime = `${time[1]}.${(time[2] || "").padEnd(3, "0")}Z`;
  const localDate = new Date(localTime);
  const capturedDate = new Date(body.capturedAt);
  if (!Number.isFinite(+capturedDate) || !Number.isFinite(+localDate) ||
      localDate.toISOString() !== localTime || +capturedDate > Date.now()) {
    throw new Error("Use a valid observation time in the past or present.");
  }

  const seen = new Set();
  const locks = body.locks.map((lock, index) => {
    const { listingId, batteryPercent, batteryStatus = null, online } = lock || {};
    const label = `Reading ${index + 1}`;
    if (typeof listingId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(listingId) || seen.has(listingId)) {
      throw new Error(`${label} needs a unique calendar listing ID.`);
    }
    if (Object.keys(lock).some(key => !["listingId", "batteryPercent", "batteryStatus", "online"].includes(key)) ||
        (batteryPercent !== null && (!Number.isInteger(batteryPercent) || batteryPercent < 0 || batteryPercent > 100)) ||
        (batteryStatus !== null && !["good", "low", "critical", "unknown"].includes(batteryStatus)) ||
        (online !== null && typeof online !== "boolean") ||
        (batteryPercent === null && batteryStatus === null && online === null)) {
      throw new Error(`${label} needs a battery percentage from 0 to 100 or null, an optional batteryStatus (good, low, critical, or unknown), and online as true, false, or null.`);
    }
    seen.add(listingId);
    return { listingId, batteryPercent, online, ...(batteryStatus === null ? {} : { batteryStatus }) };
  });

  return { capturedAt: capturedDate.toISOString(), locks };
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    "x-settings-admin-key": settingsAdminKey.value.trim()
  };
}

function showStatus(message, type = "ok") {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}

function clearStatus() {
  statusBox.textContent = "";
  statusBox.className = "status-box hidden";
}

function requireAdminKey() {
  if (!settingsAdminKey.value.trim()) {
    showStatus("Paste SETTINGS_ADMIN_KEY first.", "error");
    settingsAdminKey.focus();
    return false;
  }

  return true;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = { message: text };
    }
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

async function loadCurrentSettings() {
  if (!requireAdminKey()) return;

  clearStatus();
  loadBtn.disabled = true;
  loadBtn.textContent = "Loading...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/render-env?v=${Date.now()}`, {
      method: "GET",
      headers: adminHeaders()
    });
    const data = await parseJsonResponse(response);
    const values = data.values || {};

    gapsClientId.value = "";
    gapsClientSecret.value = "";
    gapsClientId.placeholder = values.GUESTY_CLIENT_ID
      ? `Current saved: ${values.GUESTY_CLIENT_ID}`
      : "Paste Guesty client id";
    gapsClientSecret.placeholder = values.GUESTY_CLIENT_SECRET
      ? `Current saved: ${values.GUESTY_CLIENT_SECRET}`
      : "Paste Guesty client secret";

    const renderMessage = data.renderConfigured
      ? "Render is connected."
      : "Render API key or service id is missing.";

    showStatus(`Current settings loaded. ${renderMessage}`);
  } catch (err) {
    showStatus(err.message || "Failed to load current settings.", "error");
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "Load Current";
  }
}

async function saveSettings() {
  if (!requireAdminKey()) return;

  const body = {
    GUESTY_CLIENT_ID: gapsClientId.value,
    GUESTY_CLIENT_SECRET: gapsClientSecret.value
  };

  clearStatus();
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/render-env`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body)
    });
    const data = await parseJsonResponse(response);
    const changed = Array.isArray(data.changed) ? data.changed.join(", ") : "";

    showStatus(`Saved to Render. Deploy started. Updated: ${changed || "settings"}.`);
  } catch (err) {
    showStatus(err.message || "Failed to save settings.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save To Render";
  }
}
