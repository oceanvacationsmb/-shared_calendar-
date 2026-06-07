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

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "calendar-row";

    dates.forEach(date => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";

      if (date === todayString()) {
        dayCell.classList.add("today");
      }

      const status = getStatus(property, date);
      const box = document.createElement("div");

      box.className = `status ${status.type}`;
      box.textContent = status.label;

      dayCell.appendChild(box);
      row.appendChild(dayCell);
    });

    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
  propertyListEl.scrollTop = calendarWrap.scrollTop;
}

function getStatus(property, date) {
  const bookings = Array.isArray(property.bookings) ? property.bookings : [];

  const checkout = bookings.find(b => b.checkOut === date);
  const checkin = bookings.find(b => b.checkIn === date);
  const stay = bookings.find(b => date > b.checkIn && date < b.checkOut);

  if (checkout && checkin) {
    return {
      type: "turnover",
      label: "OUT / IN"
    };
  }

  if (checkin) {
    return {
      type: "checkin",
      label: "IN"
    };
  }

  if (stay) {
    return {
      type: "stay",
      label: "STAY"
    };
  }

  if (checkout) {
    return {
      type: "checkout",
      label: "OUT"
    };
  }

  return {
    type: "empty",
    label: ""
  };
}
