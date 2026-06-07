const API_URL = "https://shared-calendar-api.onrender.com/api/calendar-all";
const DAYS_TO_SHOW = 90;
const DAYS_BEFORE_TODAY = 5;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const propertyListEl = document.getElementById("propertyList");

const showAllBtn = document.getElementById("showAllBtn");
const elevatorFilterBtn = document.getElementById("elevatorFilterBtn");
const confPmtFilterBtn = document.getElementById("confPmtFilterBtn");

let dates = [];
let properties = [];
let isSyncingScroll = false;

let activeFilters = {
  elevator: false,
  confPmt: false
};

todayBtn.addEventListener("click", () => {
  const todayIndex = dates.indexOf(todayString());

  calendarWrap.scrollTo({
    left: todayIndex > 0 ? Math.max(0, (todayIndex - 1) * getDayWidth()) : 0,
    behavior: "smooth"
  });
});

showAllBtn.addEventListener("click", () => {
  activeFilters.elevator = false;
  activeFilters.confPmt = false;
  updateFilterButtons();
  render();
});

elevatorFilterBtn.addEventListener("click", () => {
  activeFilters.elevator = !activeFilters.elevator;
  updateFilterButtons();
  render();
});

confPmtFilterBtn.addEventListener("click", () => {
  activeFilters.confPmt = !activeFilters.confPmt;
  updateFilterButtons();
  render();
});

/* Keep property names locked with calendar rows */
calendarWrap.addEventListener("scroll", () => {
  if (isSyncingScroll) return;

  isSyncingScroll = true;
  propertyListEl.scrollTop = calendarWrap.scrollTop;

  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
});

propertyListEl.addEventListener("scroll", () => {
  if (isSyncingScroll) return;

  isSyncingScroll = true;
  calendarWrap.scrollTop = propertyListEl.scrollTop;

  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
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
    month: d.toLocaleDateString("en-US", { month: "long" }),
    shortMonth: d.toLocaleDateString("en-US", { month: "short" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    day: d.toLocaleDateString("en-US", { day: "2-digit" })
  };
}

function getDayWidth() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--day-width")
    .replace("px", "")
    .trim();

  return Number(value) || 76;
}

async function loadCalendar() {
  calendarEl.innerHTML = `<div class="loading">Loading calendar...</div>`;
  propertyListEl.innerHTML = "";

  const today = todayString();
  const start = addDays(today, -DAYS_BEFORE_TODAY);
  const end = addDays(today, DAYS_TO_SHOW);

  dates = buildDates(start, DAYS_TO_SHOW + DAYS_BEFORE_TODAY);

  try {
    const res = await fetch(`${API_URL}?start=${start}&end=${end}`);
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
  updateFilterButtons();
}

function renderProperties() {
  propertyListEl.innerHTML = "";

  const visibleProperties = getVisibleProperties();

  visibleProperties.forEach(property => {
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

  getVisibleProperties().forEach(property => {
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
  calendarWrap.scrollTop = 0;
  propertyListEl.scrollTop = 0;
}

function renderDateHeader() {
  renderMonthHeader();

  const headerRow = document.createElement("div");
  headerRow.className = "date-row";

  dates.forEach(date => {
    const cell = document.createElement("div");
    cell.className = "date-cell";

    if (date === todayString()) {
      cell.classList.add("today");
    }

    const formatted = displayDate(date);

    cell.innerHTML = `
      <div class="date-month"></div>
      <div class="date-weekday">${formatted.weekday}</div>
      <div class="date-number">${formatted.day}</div>
    `;

    headerRow.appendChild(cell);
  });

  calendarEl.appendChild(headerRow);
}

function renderMonthHeader() {
  const monthRow = document.createElement("div");
  monthRow.className = "month-row";

  const groups = [];

  dates.forEach(date => {
    const formatted = displayDate(date);
    const monthName = formatted.month;

    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.month === monthName) {
      lastGroup.count += 1;
    } else {
      groups.push({
        month: monthName,
        count: 1
      });
    }
  });

  groups.forEach(group => {
    const cell = document.createElement("div");
    cell.className = "month-cell";
    cell.textContent = group.month;
    cell.style.width = `calc(${group.count} * var(--day-width))`;
    monthRow.appendChild(cell);
  });

  calendarEl.appendChild(monthRow);
}

function renderBookingBars(row, property) {
  const bookings = Array.isArray(property.bookings)
    ? [...property.bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    : [];

  bookings.filter(matchesActiveFilters).forEach(booking => {
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

    /*
      Always half-day:
      check-in starts from middle of check-in day
      checkout ends in middle of checkout day
    */
    let leftUnit = startsVisible ? checkInIndex + 0.56 : 0;
    let rightUnit = endsVisible ? checkOutIndex + 0.44 : dates.length;

    if (rightUnit <= leftUnit) return;

    const widthUnits = rightUnit - leftUnit;

    const bar = document.createElement("div");
    bar.className = "booking-bar";

    /*
      Always rounded:
      Check-in = (
      Checkout = )
    */
    if (startsVisible && endsVisible) {
      bar.classList.add("full-round");
    } else if (startsVisible) {
      bar.classList.add("start-round");
    } else if (endsVisible) {
      bar.classList.add("end-round");
    }

    bar.style.left = `calc(${leftUnit} * var(--day-width) + 2px)`;
    bar.style.width = `calc(${widthUnits} * var(--day-width) - 4px)`;

    if (startsVisible) {
      const label = document.createElement("span");
      label.className = "bar-text left";
      label.textContent = "Check-in";
      bar.appendChild(label);
    }

    const extraLabels = [];

    if (isYesValue(booking.elevator)) {
      extraLabels.push("ELEVATOR");
    }

    if (isYesValue(booking.confPmt)) {
      extraLabels.push("CONF PMT");
    }

    if (widthUnits >= 3) {
      const label = document.createElement("span");
      label.className = extraLabels.length ? "bar-text center has-extra" : "bar-text center";
      label.textContent = extraLabels.length
        ? `Guest stay • ${extraLabels.join(" • ")}`
        : "Guest stay";
      bar.appendChild(label);
    } else if (extraLabels.length) {
      const label = document.createElement("span");
      label.className = "bar-text center has-extra";
      label.textContent = extraLabels.join(" • ");
      bar.appendChild(label);
    }

    if (endsVisible) {
      const label = document.createElement("span");
      label.className = "bar-text right";
      label.textContent = "Checkout";
      bar.appendChild(label);
    }

    row.appendChild(bar);
  });
}

function isCoveredByAnyBooking(property, date) {
  const bookings = Array.isArray(property.bookings) ? property.bookings : [];

  return bookings.filter(matchesActiveFilters).some(booking => {
    if (!booking.checkIn || !booking.checkOut) return false;

    return date >= booking.checkIn && date <= booking.checkOut;
  });
}

function hasAnyActiveFilter() {
  return activeFilters.elevator || activeFilters.confPmt;
}

function matchesActiveFilters(booking) {
  if (!hasAnyActiveFilter()) return true;

  if (activeFilters.elevator && isYesValue(booking.elevator)) return true;
  if (activeFilters.confPmt && isYesValue(booking.confPmt)) return true;

  return false;
}

function isYesValue(value) {
  return value === true || String(value || "").trim().toLowerCase() === "yes";
}

function getVisibleProperties() {
  if (!hasAnyActiveFilter()) {
    return properties;
  }

  return properties.filter(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    return bookings.some(booking => {
      if (!matchesActiveFilters(booking)) return false;
      if (!booking.checkIn || !booking.checkOut) return false;

      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];

      return booking.checkOut >= firstDate && booking.checkIn <= lastDate;
    });
  });
}

function updateFilterButtons() {
  showAllBtn.classList.toggle("active", !hasAnyActiveFilter());
  elevatorFilterBtn.classList.toggle("active", activeFilters.elevator);
  confPmtFilterBtn.classList.toggle("active", activeFilters.confPmt);
}
