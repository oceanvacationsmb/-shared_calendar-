const API_URL = "https://shared-calendar-api.onrender.com/api/calendar-all";
const DAYS_TO_SHOW = 60;
const DAYS_BEFORE_TODAY = 5;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const propertyListEl = document.getElementById("propertyList");

const showAllBtn = document.getElementById("showAllBtn");
const elevatorFilterBtn = document.getElementById("elevatorFilterBtn");
const confPmtFilterBtn = document.getElementById("confPmtFilterBtn");
const listToggleBtn = document.getElementById("listToggleBtn");
const filteredListPanel = document.getElementById("filteredListPanel");
const filteredListTitle = document.getElementById("filteredListTitle");
const filteredListCount = document.getElementById("filteredListCount");
const filteredListBody = document.getElementById("filteredListBody");

let dates = [];
let properties = [];
let isSyncingScroll = false;
let isListOpen = false;
let renderTimer = null;

let activeFilters = {
  elevator: false,
  confPmt: false
};

todayBtn.addEventListener("click", () => {
  scrollToToday(true);
});

showAllBtn.addEventListener("click", () => {
  activeFilters.elevator = false;
  activeFilters.confPmt = false;
  isListOpen = false;
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

listToggleBtn.addEventListener("click", () => {
  isListOpen = !isListOpen;
  updateFilterButtons();
  updateFilteredList();
});

/* Keep property names locked with calendar rows */
calendarWrap.addEventListener("scroll", () => {
  if (isSyncingScroll) return;

  isSyncingScroll = true;
  propertyListEl.scrollTop = calendarWrap.scrollTop;

  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });

  if (hasAnyActiveFilter()) {
    scheduleFilteredRerender();
  }
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

function scrollToToday(smooth = false) {
  const todayIndex = dates.indexOf(todayString());

  const targetIndex = todayIndex >= 0 ? Math.max(0, todayIndex - 1) : 0;
  const todayScrollLeft = targetIndex * getDayWidth();

  calendarWrap.scrollTo({
    left: todayScrollLeft,
    top: calendarWrap.scrollTop,
    behavior: smooth ? "smooth" : "auto"
  });
}

async function loadCalendar() {
  calendarEl.innerHTML = `<div class="loading">Loading calendar...</div>`;
  propertyListEl.innerHTML = "";

  const today = todayString();
  const start = addDays(today, -DAYS_BEFORE_TODAY);
  const end = addDays(today, DAYS_TO_SHOW);

  dates = buildDates(start, DAYS_TO_SHOW + DAYS_BEFORE_TODAY);

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    const res = await fetch(`${API_URL}?start=${start}&end=${end}&v=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Calendar API error");
    }

    properties = data.properties || [];
    render();

    setTimeout(() => {
      scrollToToday(false);
    }, 100);

    setTimeout(() => {
      scrollToToday(false);
    }, 500);
  } catch (err) {
    calendarEl.innerHTML = `
      <div class="error">
        Calendar failed to load.<br>
        ${err.name === "AbortError" ? "Request timed out. Refresh once." : err.message}
      </div>
    `;
  }
}

function render(options = {}) {
  const oldLeft = calendarWrap.scrollLeft;
  const oldTop = calendarWrap.scrollTop;

  renderProperties();
  renderCalendar();
  updateFilterButtons();
  updateFilteredList();

  if (options.preserveScroll) {
    calendarWrap.scrollLeft = oldLeft;
    calendarWrap.scrollTop = oldTop;
    propertyListEl.scrollTop = oldTop;
  }
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

  propertyListEl.scrollTop = calendarWrap.scrollTop;
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
    cell.style.width = `calc(${group.count} * var(--day-width))`;

    const label = document.createElement("span");
    label.className = "month-label";
    label.textContent = group.month;

    cell.appendChild(label);
    monthRow.appendChild(cell);
  });

  calendarEl.appendChild(monthRow);
}

function renderBookingBars(row, property) {
  const bookings = Array.isArray(property.bookings)
    ? [...property.bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    : [];

  const visibleBookings = bookings.filter(matchesActiveFilters);

  visibleBookings.forEach(booking => {
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

    const hasCheckinSameDayAfter = visibleBookings.some(other =>
      other !== booking && other.checkIn === booking.checkOut
    );

    let leftUnit = startsVisible ? checkInIndex + 0.56 : 0;
    let rightUnit = endsVisible ? checkOutIndex + 0.44 : dates.length;

    if (rightUnit <= leftUnit) return;

    const widthUnits = rightUnit - leftUnit;

    const bar = document.createElement("div");
    bar.className = "booking-bar";

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
      label.textContent = "IN";
      bar.appendChild(label);
    }

    const extraLabels = [];

    if (isYesValue(booking.elevator)) {
      extraLabels.push("ELEVATOR");
    }

    if (isYesValue(booking.confPmt)) {
      extraLabels.push("CONF PMT");
    }

    if (widthUnits >= 1.4) {
      const label = document.createElement("span");
      label.className = extraLabels.length ? "bar-text center has-extra" : "bar-text center";

      const guestName = cleanGuestName(booking.guestName || booking.guestFullName || booking.fullName);
      const guestPhone = cleanPhone(booking.guestPhone || booking.phone);

      if (guestPhone) {
        label.innerHTML = `
          <a class="guest-call" href="tel:${guestPhone}">${escapeHtml(guestName)}</a>
          ${extraLabels.length ? ` • ${escapeHtml(extraLabels.join(" • "))}` : ""}
        `;
      } else {
        label.textContent = extraLabels.length
          ? `${guestName} • ${extraLabels.join(" • ")}`
          : guestName;
      }

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
      label.textContent = "OUT";
      bar.appendChild(label);
    }

    row.appendChild(bar);

    if (endsVisible && !hasCheckinSameDayAfter) {
      renderNciHalf(row, checkOutIndex);
    }
  });
}

function renderNciHalf(row, dateIndex) {
  if (row.querySelector(`[data-nci="${dateIndex}"]`)) return;

  const box = document.createElement("div");
  box.className = "nci-half";
  box.dataset.nci = dateIndex;

  box.style.left = `calc(${dateIndex} * var(--day-width) + (var(--day-width) / 2) + 2px)`;
  box.style.width = `calc((var(--day-width) / 2) - 4px)`;

  box.textContent = "NCI";

  row.appendChild(box);
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

function getCurrentVisibleRange() {
  const dayWidth = getDayWidth();

  const leftIndex = Math.max(0, Math.floor(calendarWrap.scrollLeft / dayWidth));
  const rightIndex = Math.min(
    dates.length - 1,
    Math.ceil((calendarWrap.scrollLeft + calendarWrap.clientWidth) / dayWidth)
  );

  return {
    start: dates[leftIndex] || dates[0],
    end: dates[rightIndex] || dates[dates.length - 1]
  };
}

function getVisibleProperties() {
  if (!hasAnyActiveFilter()) {
    return properties;
  }

  const visibleRange = getCurrentVisibleRange();

  return properties.filter(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    return bookings.some(booking => {
      if (!matchesActiveFilters(booking)) return false;
      if (!booking.checkIn || !booking.checkOut) return false;

      return booking.checkOut >= visibleRange.start && booking.checkIn <= visibleRange.end;
    });
  });
}

function getFilteredBookingsInView() {
  if (!hasAnyActiveFilter()) return [];

  const visibleRange = getCurrentVisibleRange();
  const items = [];

  properties.forEach(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    bookings.forEach(booking => {
      if (!matchesActiveFilters(booking)) return;
      if (!booking.checkIn || !booking.checkOut) return;

      const overlaps = booking.checkOut >= visibleRange.start && booking.checkIn <= visibleRange.end;
      if (!overlaps) return;

      const tags = [];

      if (isYesValue(booking.elevator)) tags.push("ELEVATOR");
      if (isYesValue(booking.confPmt)) tags.push("CONF PMT");

      items.push({
        property: property.nickname || property.name || "Property",
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestName: cleanGuestName(booking.guestName || booking.guestFullName || booking.fullName),
        guestPhone: cleanPhone(booking.guestPhone || booking.phone),
        tags
      });
    });
  });

  items.sort((a, b) => {
    const dateCompare = a.checkIn.localeCompare(b.checkIn);
    if (dateCompare !== 0) return dateCompare;
    return a.property.localeCompare(b.property);
  });

  return items;
}

function updateFilteredList() {
  const showListOption = hasAnyActiveFilter();

  listToggleBtn.classList.toggle("hidden", !showListOption);

  if (!showListOption) {
    filteredListPanel.classList.add("hidden");
    document.body.classList.remove("list-open");
    return;
  }

  filteredListPanel.classList.toggle("hidden", !isListOpen);
  document.body.classList.toggle("list-open", isListOpen);

  listToggleBtn.textContent = isListOpen ? "Hide list" : "Click for list";
  listToggleBtn.classList.toggle("active", isListOpen);

  if (!isListOpen) return;

  const items = getFilteredBookingsInView();
  const activeNames = [];

  if (activeFilters.elevator) activeNames.push("ELEVATOR");
  if (activeFilters.confPmt) activeNames.push("CONF PMT");

  filteredListTitle.textContent = `${activeNames.join(" + ")} stays in current view`;
  filteredListCount.textContent = `${items.length} stay${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    filteredListBody.innerHTML = `
      <div class="filtered-item">
        <div class="filtered-item-title">No matching stays in this visible date range</div>
        <div class="filtered-item-dates">Scroll left or right to find more.</div>
      </div>
    `;
    return;
  }

  filteredListBody.innerHTML = items.map(item => {
    const guestHtml = item.guestPhone
      ? `<a href="tel:${item.guestPhone}">${escapeHtml(item.guestName)}</a>`
      : escapeHtml(item.guestName);

    return `
      <div class="filtered-item">
        <div class="filtered-item-title">${escapeHtml(item.property)}</div>
        <div class="filtered-item-dates">IN ${escapeHtml(item.checkIn)} → OUT ${escapeHtml(item.checkOut)}</div>
        <div class="filtered-item-guest">Guest: ${guestHtml}</div>
        <div class="filtered-item-tags">${escapeHtml(item.tags.join(" • "))}</div>
      </div>
    `;
  }).join("");
}

function updateFilterButtons() {
  showAllBtn.classList.toggle("active", !hasAnyActiveFilter());
  elevatorFilterBtn.classList.toggle("active", activeFilters.elevator);
  confPmtFilterBtn.classList.toggle("active", activeFilters.confPmt);

  updateFilteredList();
}

function scheduleFilteredRerender() {
  clearTimeout(renderTimer);

  renderTimer = setTimeout(() => {
    render({ preserveScroll: true });
  }, 120);
}

function cleanGuestName(value) {
  const text = String(value || "").trim();
  return text || "Guest";
}

function cleanPhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
