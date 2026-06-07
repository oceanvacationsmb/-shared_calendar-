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

  const visibleStart = dates[0];
  const visibleEnd = addDays(dates[dates.length - 1], 1);

  property.bookings.forEach(booking => {
    const checkIn = booking.checkIn;
    const checkOut = booking.checkOut;

    if (!checkIn || !checkOut) return;

    if (checkOut < visibleStart || checkIn > visibleEnd) return;

    const checkInIndexRaw = dates.indexOf(checkIn);
    const checkOutIndexRaw = dates.indexOf(checkOut);

    const startsInRange = checkInIndexRaw >= 0;
    const endsInRange = checkOutIndexRaw >= 0;

    const hasSameDayCheckout = property.bookings.some(other =>
      other !== booking && other.checkOut === checkIn
    );

    const hasSameDayCheckin = property.bookings.some(other =>
      other !== booking && other.checkIn === checkOut
    );

    let leftIndex = startsInRange ? checkInIndexRaw : 0;
    let rightIndex = endsInRange ? checkOutIndexRaw + 1 : dates.length;

    let leftOffset = 0;
    let rightOffset = 0;

    if (startsInRange && hasSameDayCheckout) {
      leftOffset = 0.5;
    }

    if (endsInRange && hasSameDayCheckin) {
      rightOffset = -0.5;
    }

    const leftExpression = `calc((${leftIndex} + ${leftOffset}) * var(--day-col) + 3px)`;
    const widthExpression = `calc((${rightIndex - leftIndex + rightOffset - leftOffset}) * var(--day-col) - 6px)`;

    const bar = document.createElement("div");
    bar.className = "booking-bar";

    if (startsInRange) bar.classList.add("starts");
    if (endsInRange) bar.classList.add("ends");

    if (hasSameDayCheckout && startsInRange) {
      bar.classList.add("same-day-in");
    }

    if (hasSameDayCheckin && endsInRange) {
      bar.classList.add("same-day-out");
    }

    bar.style.left = leftExpression;
    bar.style.width = widthExpression;

    if (startsInRange) {
      const checkInLabel = document.createElement("span");
      checkInLabel.className = "booking-label booking-label-left";
      checkInLabel.textContent = "Check-in";
      bar.appendChild(checkInLabel);
    }

    const visibleDays = rightIndex - leftIndex;

    if (visibleDays >= 3) {
      const stayLabel = document.createElement("span");
      stayLabel.className = "booking-label booking-label-center";
      stayLabel.textContent = "Guest stay";
      bar.appendChild(stayLabel);
    }

    if (endsInRange) {
      const checkoutLabel = document.createElement("span");
      checkoutLabel.className = "booking-label booking-label-right";
      checkoutLabel.textContent = "Checkout";
      bar.appendChild(checkoutLabel);
    }

    row.appendChild(bar);
  });
}

function isDateCoveredByBooking(property, date) {
  if (!Array.isArray(property.bookings)) return false;

  return property.bookings.some(booking => {
    if (!booking.checkIn || !booking.checkOut) return false;

    return date >= booking.checkIn && date <= booking.checkOut;
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
