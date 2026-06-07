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
  if (event.key === "ArrowRight") {
    calendarWrap.scrollLeft += 120;
  }

  if (event.key === "ArrowLeft") {
    calendarWrap.scrollLeft -= 120;
  }

  if (event.key === "Home") {
    calendarWrap.scrollLeft = 0;
  }
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

  for (let i = 0; i < count; i++) {
    arr.push(addDays(start, i));
  }

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
    console.error(err);

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

    row.innerHTML = `
      <div class="property-name">${escapeHtml(property.nickname || property.name || "Property")}</div>
    `;

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

    if (date === todayString()) {
      cell.classList.add("today");
    }

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

      if (!isDateCoveredByBooking(property, date)) {
        const noGuest = document.createElement("div");
        noGuest.className = "no-guest";
        noGuest.textContent = "No guest";
        dayCell.appendChild(noGuest);
      }

      row.appendChild(dayCell);
    });

    renderBookingBars(row, property);
    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
  propertyListEl.scrollTop = calendarWrap.scrollTop;
}

function renderBookingBars(row, property) {
  if (!Array.isArray(property.bookings)) return;

  property.bookings.forEach(booking => {
    const checkIn = booking.checkIn;
    const checkOut = booking.checkOut;

    if (!checkIn || !checkOut) return;

    const visibleStart = dates[0];
    const visibleEnd = addDays(dates[dates.length - 1], 1);

    if (checkOut < visibleStart || checkIn > visibleEnd) return;

    const startsInRange = dates.includes(checkIn);
    const endsInRange = dates.includes(checkOut);

    const startIndex = Math.max(0, dates.indexOf(checkIn));
    const checkoutIndex = dates.indexOf(checkOut);

    let leftIndex = startIndex >= 0 ? startIndex : 0;
    let endIndex = checkoutIndex >= 0 ? checkoutIndex : dates.length;

    if (dates.indexOf(checkIn) < 0 && checkIn < visibleStart) {
      leftIndex = 0;
    }

    if (checkoutIndex < 0) {
      endIndex = dates.length;
    }

    const hasSameDayCheckin = property.bookings.some(other =>
      other !== booking && other.checkIn === checkOut
    );

    const hasSameDayCheckout = property.bookings.some(other =>
      other !== booking && other.checkOut === checkIn
    );

    let leftExtra = "";
    let widthExtra = "";

    if (hasSameDayCheckout && startsInRange) {
      leftExtra = " + (var(--day-col) / 2)";
    }

    if (hasSameDayCheckin && endsInRange) {
      widthExtra = " - (var(--day-col) / 2)";
    }

    const durationDays = Math.max(1, endIndex - leftIndex + (endsInRange ? 1 : 0));

    const bar = document.createElement("div");
    bar.className = "booking-bar";

    if (startsInRange) bar.classList.add("starts");
    if (endsInRange) bar.classList.add("ends");

    bar.style.left = `calc(${leftIndex} * var(--day-col)${leftExtra} + 3px)`;
    bar.style.width = `calc(${durationDays} * var(--day-col)${widthExtra} - 6px)`;

    const label = document.createElement("div");
    label.className = "booking-label";

    if (startsInRange && endsInRange && durationDays <= 2) {
      label.classList.add("stay-label");
      label.textContent = "Stay";
    } else if (startsInRange) {
      label.classList.add("checkin-label");
      label.textContent = "Check-in";
    } else if (endsInRange) {
      label.classList.add("checkout-label");
      label.textContent = "Checkout";
    } else {
      label.classList.add("stay-label");
      label.textContent = "Guest stay";
    }

    if (hasSameDayCheckin && endsInRange) {
      label.className = "booking-label turnover-out";
      label.textContent = "Checkout";
    }

    if (hasSameDayCheckout && startsInRange) {
      label.className = "booking-label turnover-in";
      label.textContent = "Check-in";
    }

    bar.appendChild(label);
    row.appendChild(bar);
  });
}

function isDateCoveredByBooking(property, date) {
  if (!Array.isArray(property.bookings)) return false;

  return property.bookings.some(booking => {
    if (!booking.checkIn || !booking.checkOut) return false;

    const hasSameDayCheckin = property.bookings.some(other =>
      other !== booking && other.checkIn === booking.checkOut
    );

    if (date > booking.checkIn && date < booking.checkOut) return true;
    if (date === booking.checkIn) return true;

    if (date === booking.checkOut && hasSameDayCheckin) return true;

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
