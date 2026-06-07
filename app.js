const API_BASE = "https://ocean-specials.onrender.com";

let currentWeekStart = getStartOfWeek(new Date());

const calendarEl = document.getElementById("calendar");
const weekTitleEl = document.getElementById("weekTitle");

document.getElementById("prevWeekBtn").addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  loadCalendar();
});

document.getElementById("nextWeekBtn").addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  loadCalendar();
});

document.getElementById("todayBtn").addEventListener("click", () => {
  currentWeekStart = getStartOfWeek(new Date());
  loadCalendar();
});

loadCalendar();

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function displayDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getWeekDays(start) {
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  return days;
}

async function loadCalendar() {
  calendarEl.innerHTML = `<div class="loading">Loading calendar...</div>`;

  const weekDays = getWeekDays(currentWeekStart);
  const start = formatDate(weekDays[0]);

  const endDate = new Date(weekDays[6]);
  endDate.setDate(endDate.getDate() + 1);
  const end = formatDate(endDate);

  weekTitleEl.textContent = `${displayDate(weekDays[0])} - ${displayDate(weekDays[6])}`;

  try {
    const res = await fetch(`${API_BASE}/api/shared-calendar?start=${start}&end=${end}`);

    if (!res.ok) {
      throw new Error("Calendar API not ready yet");
    }

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.message || "Calendar API error");
    }

    renderCalendar(data.properties || [], weekDays);

  } catch (err) {
    console.error(err);

    calendarEl.innerHTML = `
      <div class="error">
        Calendar API is not connected yet.<br><br>
        The page is ready. Next we need to add the backend route:
        <br>
        <code>/api/shared-calendar</code>
      </div>
    `;
  }
}

function renderCalendar(properties, weekDays) {
  if (!properties.length) {
    calendarEl.innerHTML = `<div class="loading">No bookings found for this week.</div>`;
    return;
  }

  calendarEl.innerHTML = "";

  properties.forEach(property => {
    const card = document.createElement("section");
    card.className = "property-card";

    const title = document.createElement("div");
    title.className = "property-title";
    title.textContent = property.name;

    const grid = document.createElement("div");
    grid.className = "days-grid";

    weekDays.forEach(day => {
      const dayBox = document.createElement("div");
      dayBox.className = "day";

      if (formatDate(day) === formatDate(new Date())) {
        dayBox.classList.add("today");
      }

      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.textContent = displayDate(day);
      dayBox.appendChild(dayHeader);

      const events = getEventsForDay(property.bookings || [], day);

      if (!events.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Open / No guest";
        dayBox.appendChild(empty);
      } else {
        events.forEach(event => {
          const eventEl = document.createElement("div");
          eventEl.className = `event ${event.type}`;
          eventEl.textContent = event.label;
          dayBox.appendChild(eventEl);
        });
      }

      grid.appendChild(dayBox);
    });

    card.appendChild(title);
    card.appendChild(grid);
    calendarEl.appendChild(card);
  });
}

function getEventsForDay(bookings, day) {
  const dayStr = formatDate(day);
  const events = [];

  bookings.forEach(booking => {
    const checkIn = booking.checkIn;
    const checkOut = booking.checkOut;

    if (dayStr === checkIn && dayStr === checkOut) {
      events.push({
        type: "turnover",
        label: "Check-out + Check-in"
      });
      return;
    }

    if (dayStr === checkIn) {
      events.push({
        type: "checkin",
        label: "Check-in"
      });
      return;
    }

    if (dayStr === checkOut) {
      events.push({
        type: "checkout",
        label: "Check-out"
      });
      return;
    }

    if (dayStr > checkIn && dayStr < checkOut) {
      events.push({
        type: "stay",
        label: "Guest stay"
      });
    }
  });

  return events;
}
