const API_BASE = "https://shared-calendar-api.onrender.com";
const DAYS_TO_SHOW = 14;

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
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { day: "2-digit" })
  };
}

function monthYear(dateString) {
  const d = new Date(dateString + "T00:00:00");

  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
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
  resultCountEl.textContent = `${filteredProperties.length} results`;
  renderPropertyList(filteredProperties);
  renderCalendar(filteredProperties);
}

function renderPropertyList(properties) {
  propertyListEl.innerHTML = "";

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "property-row";

    row.innerHTML = `
      <div class="property-thumb"></div>
      <div class="property-info">
        <div class="property-name">${escapeHtml(property.nickname || property.name || "Property")}</div>
        <div class="property-sub">Guest calendar</div>
      </div>
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

  dates.forEach(date => {
    const cell = document.createElement("div");
    cell.className = "date-cell";

    if (date === todayString()) {
      cell.classList.add("today");
    }

    const formatted = displayDate(date);

    cell.innerHTML = `
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
    line.style.left = `${todayIndex * 120 + 60}px`;
    calendarEl.appendChild(line);
  }

  properties.forEach(property => {
    const row = document.createElement("div");
    row.className = "calendar-row";

    dates.forEach(date => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";

      const event = getEventForDate(property, date);

      if (event) {
        const eventEl = document.createElement("div");

        if (event.type === "turnover") {
          eventEl.className = "event turnover";
          eventEl.innerHTML = `
            <div class="turnover-half turnover-checkout">Checkout</div>
            <div class="turnover-half turnover-checkin">Check-in</div>
          `;
        } else {
          eventEl.className = `event ${event.type}`;
          eventEl.innerHTML = `
            <div class="event-label">
              ${event.type === "checkin" ? `<span class="channel-icon">⌂</span>` : ""}
              <span>${event.label}</span>
            </div>
          `;
        }

        dayCell.appendChild(eventEl);
      } else {
        const noGuest = document.createElement("div");
        noGuest.className = "no-guest";
        noGuest.textContent = "No guest";
        dayCell.appendChild(noGuest);
      }

      row.appendChild(dayCell);
    });

    calendarEl.appendChild(row);
  });

  calendarWrap.scrollLeft = 0;
  propertyListEl.scrollTop = calendarWrap.scrollTop;
}

function getEventForDate(property, date) {
  const dayFromApi = Array.isArray(property.days)
    ? property.days.find(d => d.date === date)
    : null;

  if (dayFromApi && Array.isArray(dayFromApi.events) && dayFromApi.events.length) {
    const hasCheckout = dayFromApi.events.some(e =>
      String(e.type).toLowerCase() === "checkout" ||
      String(e.label).toLowerCase().includes("checkout")
    );

    const hasCheckin = dayFromApi.events.some(e =>
      String(e.type).toLowerCase() === "checkin" ||
      String(e.type).toLowerCase() === "check-in" ||
      String(e.label).toLowerCase().includes("check-in") ||
      String(e.label).toLowerCase().includes("checkin")
    );

    if (hasCheckout && hasCheckin) {
      return {
        type: "turnover",
        label: "Checkout / Check-in"
      };
    }

    if (hasCheckout) {
      return {
        type: "checkout",
        label: "Checkout"
      };
    }

    if (hasCheckin) {
      return {
        type: "checkin",
        label: "Check-in"
      };
    }

    const hasStay = dayFromApi.events.some(e =>
      String(e.type).toLowerCase() === "stay" ||
      String(e.label).toLowerCase().includes("stay")
    );

    if (hasStay) {
      return {
        type: "stay",
        label: "Guest stay"
      };
    }

    return dayFromApi.events[0];
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
