const API_BASE = "https://shared-calendar-api.onrender.com";
const DAYS_TO_SHOW = 14;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");

let dates = [];

todayBtn.addEventListener("click", () => {
  calendarWrap.scrollTo({
    left: 0,
    behavior: "smooth"
  });
});

calendarWrap.addEventListener("wheel", event => {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    calendarWrap.scrollLeft += event.deltaY;
    event.preventDefault();
  }
}, { passive: false });

window.addEventListener("keydown", event => {
  if (event.key === "ArrowRight") {
    calendarWrap.scrollLeft += 140;
  }

  if (event.key === "ArrowLeft") {
    calendarWrap.scrollLeft -= 140;
  }

  if (event.key === "Home") {
    calendarWrap.scrollLeft = 0;
  }
});

loadCalendar();

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function displayDate(dateString) {
  const d = new Date(dateString + "T00:00:00");

  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
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

  const start = todayString();
  const end = addDays(start, DAYS_TO_SHOW);

  dates = buildDates(start, DAYS_TO_SHOW);

  try {
    const res = await fetch(`${API_BASE}/api/shared-calendar?start=${start}&end=${end}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Calendar API error");
    }

    renderCalendar(data.properties || []);
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

function renderCalendar(properties) {
  if (!properties.length) {
    calendarEl.innerHTML = `<div class="loading">No properties found.</div>`;
    return;
  }

  calendarEl.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "calendar-row date-row";

  const propertyHeader = document.createElement("div");
  propertyHeader.className = "property-cell";
  propertyHeader.textContent = "Property";
  headerRow.appendChild(propertyHeader);

  dates.forEach(date => {
    const cell = document.createElement("div");
    cell.className = "date-cell";

    if (date === todayString()) {
      cell.classList.add("today");
    }

    const formatted = displayDate(date);

    cell.innerHTML = `
      <div class="weekday">${formatted.weekday}</div>
      <div class="date">${formatted.date}</div>
    `;

    headerRow.appendChild(cell);
  });

  calendarEl.appendChild(headerRow);

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "calendar-row";

    const propertyCell = document.createElement("div");
    propertyCell.className = "property-cell";
    propertyCell.textContent = property.nickname || property.name || "Property";
    row.appendChild(propertyCell);

    dates.forEach(date => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";

      if (date === todayString()) {
        dayCell.classList.add("today");
      }

      const event = getEventForDate(property, date);

      if (event) {
        const eventEl = document.createElement("div");
        eventEl.className = `event ${event.type}`;
        eventEl.textContent = event.label;
        dayCell.appendChild(eventEl);
      } else {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "—";
        dayCell.appendChild(empty);
      }

      row.appendChild(dayCell);
    });

    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
}

function getEventForDate(property, date) {
  if (Array.isArray(property.days)) {
    const day = property.days.find(d => d.date === date);

    if (day && Array.isArray(day.events) && day.events.length) {
      return day.events[0];
    }
  }

  if (Array.isArray(property.bookings)) {
    const checkout = property.bookings.find(b => b.checkOut === date);
    const checkin = property.bookings.find(b => b.checkIn === date);
    const stay = property.bookings.find(b => date > b.checkIn && date < b.checkOut);

    if (checkout && checkin) {
      return {
        type: "turnover",
        label: "Checkout / Check-in"
      };
    }

    if (checkout) {
      return {
        type: "checkout",
        label: "Checkout"
      };
    }

    if (checkin) {
      return {
        type: "checkin",
        label: "Check-in"
      };
    }

    if (stay) {
      return {
        type: "stay",
        label: "Guest stay"
      };
    }
  }

  return null;
}
