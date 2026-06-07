const API_BASE = "https://shared-calendar-api.onrender.com";
const DAYS_TO_SHOW = 90;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const propertyListEl = document.getElementById("propertyList");
const resultCountEl = document.getElementById("resultCount");

let dates = [];
let allProperties = [];
let filteredProperties = [];

todayBtn.addEventListener("click", () => {
  calendarWrap.scrollTo({
    left: 0,
    behavior: "smooth"
  });
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  applySearch();
});

searchInput.addEventListener("input", applySearch);

calendarWrap.addEventListener("scroll", () => {
  propertyListEl.scrollTop = calendarWrap.scrollTop;
});

window.addEventListener("keydown", event => {
  if (event.key === "ArrowRight") calendarWrap.scrollLeft += 180;
  if (event.key === "ArrowLeft") calendarWrap.scrollLeft -= 180;
  if (event.key === "Home") calendarWrap.scrollLeft = 0;
});

loadCalendar();

function todayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
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

function displayDate(dateString) {
  const d = new Date(dateString + "T00:00:00");

  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { day: "2-digit" })
  };
}

function buildDates(start, count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(addDays(start, i));
  return arr;
}

async function loadCalendar() {
  calendarEl.innerHTML = `<div class="loading">Loading calendar...</div>`;
  propertyListEl.innerHTML = "";

  const start = todayString();
  const end = addDays(start, DAYS_TO_SHOW);

  dates = buildDates(start, DAYS_TO_SHOW);

  try {
    const res = await fetch(`${API_BASE}/api/shared-calendar?start=${start}&end=${end}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Calendar API error");
    }

    allProperties = data.properties || [];
    filteredProperties = allProperties;
    renderAll();
  } catch (err) {
    calendarEl.innerHTML = `
      <div class="error">
        Calendar failed to load.<br>
        ${err.message}
      </div>
    `;
  }
}

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();

  if (!q) {
    filteredProperties = allProperties;
  } else {
    filteredProperties = allProperties.filter(property => {
      const name = String(property.nickname || property.name || "").toLowerCase();
      return name.includes(q);
    });
  }

  renderAll();
}

function renderAll() {
  resultCountEl.textContent = `${filteredProperties.length} properties`;
  renderPropertyList(filteredProperties);
  renderCalendar(filteredProperties);
}

function renderPropertyList(properties) {
  propertyListEl.innerHTML = "";

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "property-row";
    row.innerHTML = `<div class="property-name">${escapeHtml(property.nickname || property.name || "Property")}</div>`;
    propertyListEl.appendChild(row);
  });
}

function renderCalendar(properties) {
  if (!properties.length) {
    calendarEl.innerHTML = `<div class="loading">No properties found.</div>`;
    return;
  }

  calendarEl.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "date-row";

  dates.forEach((date, index) => {
    const cell = document.createElement("div");
    cell.className = "date-cell";

    if (date === todayString()) cell.classList.add("today");

    const formatted = displayDate(date);
    const previous = dates[index - 1];
    const previousFormatted = previous ? displayDate(previous) : null;
    const showMonth = !previousFormatted || previousFormatted.month !== formatted.month;

    cell.innerHTML = `
      <div class="date-month">${showMonth ? formatted.month : ""}</div>
      <div class="date-weekday">${formatted.weekday}</div>
      <div class="date-number">${formatted.date}</div>
    `;

    headerRow.appendChild(cell);
  });

  calendarEl.appendChild(headerRow);

  const todayIndex = dates.indexOf(todayString());
  if (todayIndex >= 0) {
    const line = document.createElement("div");
    line.className = "today-line";
    line.style.left = `calc(${todayIndex} * var(--day-col) + (var(--day-col) / 2))`;
    calendarEl.appendChild(line);
  }

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "calendar-row";

    dates.forEach(date => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";

      if (!isCovered(property, date)) {
        const noGuest = document.createElement("div");
        noGuest.className = "no-guest";
        noGuest.textContent = "No guest";
        dayCell.appendChild(noGuest);
      }

      row.appendChild(dayCell);
    });

    renderBars(row, property);
    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
  propertyListEl.scrollTop = calendarWrap.scrollTop;
}

function renderBars(row, property) {
  if (!Array.isArray(property.bookings)) return;

  const sorted = [...property.bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const visibleStart = dates[0];
  const visibleLast = dates[dates.length - 1];

  sorted.forEach(booking => {
    if (!booking.checkIn || !booking.checkOut) return;

    if (booking.checkOut < visibleStart || booking.checkIn > visibleLast) return;

    const startIndexRaw = dates.indexOf(booking.checkIn);
    const endIndexRaw = dates.indexOf(booking.checkOut);

    const startsInView = startIndexRaw >= 0;
    const endsInView = endIndexRaw >= 0;

    const prevSameDayCheckout = sorted.some(other => other !== booking && other.checkOut === booking.checkIn);
    const nextSameDayCheckin = sorted.some(other => other !== booking && other.checkIn === booking.checkOut);

    let leftUnits;
    if (startsInView) {
      leftUnits = startIndexRaw + (prevSameDayCheckout ? 0.5 : 0);
    } else {
      leftUnits = 0;
    }

    let rightUnits;
    if (endsInView) {
      rightUnits = endIndexRaw + (nextSameDayCheckin ? 0.5 : 1);
    } else {
      rightUnits = dates.length;
    }

    if (rightUnits <= leftUnits) return;

    const widthUnits = rightUnits - leftUnits;

    // if same-day turnover split is needed, create two halves in the same cell only
    if (startsInView && prevSameDayCheckout) {
      const split = document.createElement("div");
      split.className = "turnover-split";
      split.style.left = `calc(${startIndexRaw} * var(--day-col) + (var(--day-col) / 2) + 1px)`;
      split.style.width = `calc((var(--day-col) / 2) - 2px)`;
      split.innerHTML = `<div class="turnover-half turnover-in">Check-in</div>`;
      row.appendChild(split);
    }

    if (endsInView && nextSameDayCheckin) {
      const split = document.createElement("div");
      split.className = "turnover-split";
      split.style.left = `calc(${endIndexRaw} * var(--day-col) + 1px)`;
      split.style.width = `calc((var(--day-col) / 2) - 2px)`;
      split.innerHTML = `<div class="turnover-half turnover-out">Checkout</div>`;
      row.appendChild(split);
    }

    const bar = document.createElement("div");
    bar.className = "booking-bar";

    if (startsInView && !prevSameDayCheckout) bar.classList.add("starts");
    if (endsInView && !nextSameDayCheckin) bar.classList.add("ends");

    bar.style.left = `calc(${leftUnits} * var(--day-col) + 1px)`;
    bar.style.width = `calc(${widthUnits} * var(--day-col) - 2px)`;

    if (startsInView && !prevSameDayCheckout) {
      const leftLabel = document.createElement("span");
      leftLabel.className = "bar-label left";
      leftLabel.textContent = "Check-in";
      bar.appendChild(leftLabel);
    }

    if (widthUnits >= 4) {
      const centerLabel = document.createElement("span");
      centerLabel.className = "bar-label center";
      centerLabel.textContent = "Guest stay";
      bar.appendChild(centerLabel);
    }

    if (endsInView && !nextSameDayCheckin) {
      const rightLabel = document.createElement("span");
      rightLabel.className = "bar-label right";
      rightLabel.textContent = "Checkout";
      bar.appendChild(rightLabel);
    }

    row.appendChild(bar);
  });
}

function isCovered(property, date) {
  if (!Array.isArray(property.bookings)) return false;

  return property.bookings.some(booking => {
    if (!booking.checkIn || !booking.checkOut) return false;

    if (date >= booking.checkIn && date <= booking.checkOut) return true;
    return false;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
