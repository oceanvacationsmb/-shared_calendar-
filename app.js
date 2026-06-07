const API_BASE = "https://shared-calendar-api.onrender.com";
const DAYS_TO_SHOW = 90;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const propertyListEl = document.getElementById("propertyList");

let dates = [];
let properties = [];

todayBtn.addEventListener("click", () => {
  calendarWrap.scrollTo({
    left: 0,
    behavior: "smooth"
  });
});

calendarWrap.addEventListener("scroll", () => {
  propertyListEl.scrollTop = calendarWrap.scrollTop;
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

function buildDates(start, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push(addDays(start, i));
  }
  return arr;
}

function displayDate(dateString) {
  const d = new Date(dateString + "T00:00:00");
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    day: d.toLocaleDateString("en-US", { day: "2-digit" })
  };
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

    properties = data.properties || [];
    render();
  } catch (err) {
    calendarEl.innerHTML = `
      <div class="error">
        Calendar failed to load.<br>
        ${err.message}
      </div>
    `;
  }
}

function render() {
  renderProperties();
  renderCalendar();
}

function renderProperties() {
  propertyListEl.innerHTML = "";

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "property-row";
    row.textContent = property.nickname || property.name || "Property";
    propertyListEl.appendChild(row);
  });
}

function renderCalendar() {
  calendarEl.innerHTML = "";

  renderDateHeader();

  const todayIndex = dates.indexOf(todayString());
  if (todayIndex >= 0) {
    const line = document.createElement("div");
    line.className = "today-line";
    line.style.left = `calc(${todayIndex} * var(--day-width) + (var(--day-width) / 2))`;
    calendarEl.appendChild(line);
  }

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "calendar-row";

    dates.forEach(date => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";

      if (date === todayString()) {
        dayCell.classList.add("today");
      }

      if (!isCoveredByAnyBooking(property, date)) {
        const empty = document.createElement("div");
        empty.className = "no-stay";
        empty.textContent = "No stay";
        dayCell.appendChild(empty);
      }

      row.appendChild(dayCell);
    });

    renderBookingBars(row, property);
    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
  propertyListEl.scrollTop = calendarWrap.scrollTop;
}

function renderDateHeader() {
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
      <div class="date-number">${formatted.day}</div>
    `;

    headerRow.appendChild(cell);
  });

  calendarEl.appendChild(headerRow);
}

function renderBookingBars(row, property) {
  const bookings = Array.isArray(property.bookings)
    ? [...property.bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    : [];

  bookings.forEach(booking => {
    if (!booking.checkIn || !booking.checkOut) return;

    const checkInIndex = dates.indexOf(booking.checkIn);
    const checkOutIndex = dates.indexOf(booking.checkOut);

    const visibleStart = dates[0];
    const visibleEnd = dates[dates.length - 1];

    if (booking.checkOut < visibleStart || booking.checkIn > visibleEnd) {
      return;
    }

    const startsVisible = checkInIndex >= 0;
    const endsVisible = checkOutIndex >= 0;

    const prevSameDayCheckout = bookings.some(other =>
      other !== booking && other.checkOut === booking.checkIn
    );

    const nextSameDayCheckin = bookings.some(other =>
      other !== booking && other.checkIn === booking.checkOut
    );

    let leftUnit = startsVisible ? checkInIndex : 0;
    let rightUnit = endsVisible ? checkOutIndex + 1 : dates.length;

    if (startsVisible && prevSameDayCheckout) {
      leftUnit = checkInIndex + 0.5;
      renderTurnoverIn(row, checkInIndex);
    }

    if (endsVisible && nextSameDayCheckin) {
      rightUnit = checkOutIndex + 0.5;
      renderTurnoverOut(row, checkOutIndex);
    }

    if (rightUnit <= leftUnit) return;

    const bar = document.createElement("div");
    bar.className = "booking-bar";

    const widthUnits = rightUnit - leftUnit;

    const isFullRound =
      startsVisible &&
      endsVisible &&
      !prevSameDayCheckout &&
      !nextSameDayCheckin &&
      widthUnits <= 1;

    if (isFullRound) {
      bar.classList.add("full-round");
    } else {
      if (startsVisible && !prevSameDayCheckout) bar.classList.add("start-round");
      if (endsVisible && !nextSameDayCheckin) bar.classList.add("end-round");
    }

    bar.style.left = `calc(${leftUnit} * var(--day-width) + 2px)`;
    bar.style.width = `calc(${widthUnits} * var(--day-width) - 4px)`;

    if (startsVisible && !prevSameDayCheckout) {
      const label = document.createElement("span");
      label.className = "bar-text left";
      label.textContent = "Check-in";
      bar.appendChild(label);
    }

    if (widthUnits >= 3) {
      const label = document.createElement("span");
      label.className = "bar-text center";
      label.textContent = "Guest stay";
      bar.appendChild(label);
    }

    if (endsVisible && !nextSameDayCheckin) {
      const label = document.createElement("span");
      label.className = "bar-text right";
      label.textContent = "Checkout";
      bar.appendChild(label);
    }

    row.appendChild(bar);
  });
}

function renderTurnoverOut(row, index) {
  if (row.querySelector(`[data-turnover-out="${index}"]`)) return;

  const pill = document.createElement("div");
  pill.className = "turnover-pill";
  pill.dataset.turnoverOut = index;
  pill.style.left = `calc(${index} * var(--day-width) + 3px)`;
  pill.style.width = `calc((var(--day-width) / 2) - 6px)`;
  pill.innerHTML = `<span class="turnover-pill-text">Out</span>`;
  row.appendChild(pill);
}

function renderTurnoverIn(row, index) {
  if (row.querySelector(`[data-turnover-in="${index}"]`)) return;

  const pill = document.createElement("div");
  pill.className = "turnover-pill";
  pill.dataset.turnoverIn = index;
  pill.style.left = `calc(${index} * var(--day-width) + (var(--day-width) / 2) + 3px)`;
  pill.style.width = `calc((var(--day-width) / 2) - 6px)`;
  pill.innerHTML = `<span class="turnover-pill-text">In</span>`;
  row.appendChild(pill);
}

function isCoveredByAnyBooking(property, date) {
  const bookings = Array.isArray(property.bookings) ? property.bookings : [];

  return bookings.some(booking => {
    if (!booking.checkIn || !booking.checkOut) return false;
    return date >= booking.checkIn && date <= booking.checkOut;
  });
}
