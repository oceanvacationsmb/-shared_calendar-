const API_URL = "https://shared-calendar-api.onrender.com/api/calendar-all";
const TASKS_API_URL = "https://shared-calendar-api.onrender.com/api/calendar-tasks";
const TASK_VENDORS_API_URL = "https://shared-calendar-api.onrender.com/api/calendar-task-vendors";

const DAYS_TO_SHOW = 60;
const DAYS_BEFORE_TODAY = 5;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const propertyListEl = document.getElementById("propertyList");

const newTaskBtn = document.getElementById("newTaskBtn");
const tasksFilterBtn = document.getElementById("tasksFilterBtn");
const elevatorFilterBtn = document.getElementById("elevatorFilterBtn");
const confPmtFilterBtn = document.getElementById("confPmtFilterBtn");
const listToggleBtn = document.getElementById("listToggleBtn");
const cityFilterSelect = document.getElementById("cityFilterSelect");

const filteredListPanel = document.getElementById("filteredListPanel");
const filteredListTitle = document.getElementById("filteredListTitle");
const filteredListCount = document.getElementById("filteredListCount");
const filteredListBody = document.getElementById("filteredListBody");

const newTaskModal = document.getElementById("newTaskModal");
const closeNewTaskBtn = document.getElementById("closeNewTaskBtn");
const cancelNewTaskBtn = document.getElementById("cancelNewTaskBtn");
const saveTaskBtn = document.getElementById("saveTaskBtn");
const taskPropertySelect = document.getElementById("taskPropertySelect");
const taskTextInput = document.getElementById("taskTextInput");
const taskAssigneeSelect = document.getElementById("taskAssigneeSelect");
const showAddVendorBtn = document.getElementById("showAddVendorBtn");
const addVendorBox = document.getElementById("addVendorBox");
const newVendorInput = document.getElementById("newVendorInput");
const saveVendorBtn = document.getElementById("saveVendorBtn");
const taskMediaInput = document.getElementById("taskMediaInput");
const taskMediaPreview = document.getElementById("taskMediaPreview");
const newTaskError = document.getElementById("newTaskError");

const viewTasksModal = document.getElementById("viewTasksModal");
const closeViewTasksBtn = document.getElementById("closeViewTasksBtn");
const doneViewTasksBtn = document.getElementById("doneViewTasksBtn");
const addTaskForPropertyBtn = document.getElementById("addTaskForPropertyBtn");
const viewTasksTitle = document.getElementById("viewTasksTitle");
const tasksList = document.getElementById("tasksList");

const completeTaskModal = document.getElementById("completeTaskModal");
const closeCompleteTaskBtn = document.getElementById("closeCompleteTaskBtn");
const completeUploadBox = document.getElementById("completeUploadBox");
const completeMediaInput = document.getElementById("completeMediaInput");
const completeMediaPreview = document.getElementById("completeMediaPreview");
const completeTaskError = document.getElementById("completeTaskError");
const completeNoBtn = document.getElementById("completeNoBtn");
const completeYesBtn = document.getElementById("completeYesBtn");
const finishCompleteTaskBtn = document.getElementById("finishCompleteTaskBtn");

let dates = [];
let properties = [];
let tasks = [];
let taskVendors = [];
let isSyncingScroll = false;
let isListOpen = false;
let renderTimer = null;
let selectedTaskProperty = null;
let editingTaskId = null;
let pendingCompleteTaskId = null;

let activeFilters = {
  elevator: false,
  confPmt: false,
  tasks: false,
  area: null
};

todayBtn.addEventListener("click", () => {
  scrollToToday(true);
});

newTaskBtn.addEventListener("click", () => {
  openNewTaskModal();
});

closeNewTaskBtn.addEventListener("click", closeNewTaskModal);
cancelNewTaskBtn.addEventListener("click", closeNewTaskModal);

saveTaskBtn.addEventListener("click", () => {
  saveNewTask();
});

showAddVendorBtn.addEventListener("click", () => {
  addVendorBox.classList.toggle("hidden");
  newVendorInput.focus();
});

saveVendorBtn.addEventListener("click", () => {
  saveNewVendor();
});

closeViewTasksBtn.addEventListener("click", closeViewTasksModal);
doneViewTasksBtn.addEventListener("click", closeViewTasksModal);
addTaskForPropertyBtn.addEventListener("click", () => {
  if (!selectedTaskProperty) return;

  const property = selectedTaskProperty;
  closeViewTasksModal();
  openNewTaskModal(property);
});

closeCompleteTaskBtn.addEventListener("click", closeCompleteTaskModal);
completeNoBtn.addEventListener("click", () => {
  finishCompleteTask(false);
});
completeYesBtn.addEventListener("click", () => {
  completeUploadBox.classList.remove("hidden");
  completeYesBtn.classList.add("hidden");
  finishCompleteTaskBtn.classList.remove("hidden");
});
finishCompleteTaskBtn.addEventListener("click", () => {
  finishCompleteTask(true);
});

taskMediaInput.addEventListener("change", () => {
  renderFilePreview(taskMediaInput.files, taskMediaPreview);
});

completeMediaInput.addEventListener("change", () => {
  renderFilePreview(completeMediaInput.files, completeMediaPreview);
});

newTaskModal.addEventListener("click", event => {
  if (event.target === newTaskModal) {
    closeNewTaskModal();
  }
});

viewTasksModal.addEventListener("click", event => {
  if (event.target === viewTasksModal) {
    closeViewTasksModal();
  }
});

completeTaskModal.addEventListener("click", event => {
  if (event.target === completeTaskModal) {
    closeCompleteTaskModal();
  }
});

cityFilterSelect.addEventListener("change", () => {
  activeFilters.elevator = false;
  activeFilters.confPmt = false;
  activeFilters.area = cityFilterSelect.value || null;
  isListOpen = false;

  updateFilterButtons();
  render();
});

tasksFilterBtn.addEventListener("click", () => {
  activeFilters.tasks = !activeFilters.tasks;
  activeFilters.elevator = false;
  activeFilters.confPmt = false;
  isListOpen = false;

  updateFilterButtons();
  render();
});

elevatorFilterBtn.addEventListener("click", () => {
  activeFilters.area = null;
  activeFilters.tasks = false;
  cityFilterSelect.value = "";

  activeFilters.elevator = !activeFilters.elevator;
  activeFilters.confPmt = false;

  updateFilterButtons();
  render();
});

confPmtFilterBtn.addEventListener("click", () => {
  activeFilters.area = null;
  activeFilters.tasks = false;
  cityFilterSelect.value = "";

  activeFilters.confPmt = !activeFilters.confPmt;
  activeFilters.elevator = false;

  updateFilterButtons();
  render();
});

listToggleBtn.addEventListener("click", () => {
  isListOpen = !isListOpen;
  updateFilterButtons();
  updateFilteredList();
});

calendarWrap.addEventListener("scroll", () => {
  if (isSyncingScroll) return;

  isSyncingScroll = true;
  propertyListEl.scrollTop = calendarWrap.scrollTop;

  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });

  if (hasMovingFilter()) {
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

    const [calendarResponse, tasksResponse, vendorsResponse] = await Promise.all([
      fetch(`${API_URL}?start=${start}&end=${end}&v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(`${TASKS_API_URL}?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(`${TASK_VENDORS_API_URL}?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      })
    ]);

    clearTimeout(timeout);

    const data = await calendarResponse.json();
    const tasksData = await tasksResponse.json();
    const vendorsData = await vendorsResponse.json();

    if (!calendarResponse.ok || !data.ok) {
      throw new Error(data.message || "Calendar API error");
    }

    if (!tasksResponse.ok || !tasksData.ok) {
      throw new Error(tasksData.message || "Tasks API error");
    }

    properties = data.properties || [];
    tasks = tasksData.tasks || [];
    taskVendors = vendorsResponse.ok && vendorsData.ok
      ? vendorsData.vendors || []
      : (vendorsData.defaultVendors || []).map(name => ({ name }));

    render();
    fillTaskPropertySelect();
    fillTaskVendorSelect();

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

async function reloadTasksOnly() {
  const res = await fetch(`${TASKS_API_URL}?v=${Date.now()}`, {
    cache: "no-store"
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.message || "Failed to reload tasks");
  }

  tasks = data.tasks || [];
  render({ preserveScroll: true });
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

  getVisibleProperties().forEach(property => {
    const row = document.createElement("div");
    row.className = "property-row";

    const name = document.createElement("div");
    name.className = "property-name";
    name.textContent = property.nickname || property.name || "Property";
    row.appendChild(name);

    const propertyTasks = getTasksForProperty(property);

    if (propertyTasks.length) {
      const badge = document.createElement("button");
      badge.className = "task-badge";
      badge.textContent = propertyTasks.length === 1 ? "1 TASK" : `${propertyTasks.length} TASKS`;
      badge.addEventListener("click", event => {
        event.stopPropagation();
        openViewTasksModal(property);
      });

      row.appendChild(badge);
    }

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

  const visibleBookings = bookings.filter(booking => matchesBookingFilters(booking, property));

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
      extraLabels.push("CONFIRM PMT");
    }

    if (widthUnits >= 1.4) {
      const label = document.createElement("span");
      label.className = extraLabels.length ? "bar-text center has-extra" : "bar-text center";

      const guestName = cleanGuestName(
        booking.guestName ||
        booking.guestFullName ||
        booking.fullName ||
        booking.guest?.fullName
      );

      const guestPhone = cleanPhone(
        booking.guestPhone ||
        booking.phone ||
        booking.guest?.phone
      );

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

  return bookings
    .filter(booking => matchesBookingFilters(booking, property))
    .some(booking => {
      if (!booking.checkIn || !booking.checkOut) return false;
      return date >= booking.checkIn && date <= booking.checkOut;
    });
}

function hasAnyActiveFilter() {
  return Boolean(activeFilters.elevator || activeFilters.confPmt || activeFilters.tasks || activeFilters.area);
}

function hasMovingFilter() {
  return Boolean(activeFilters.elevator || activeFilters.confPmt);
}

function matchesBookingFilters(booking, property) {
  if (activeFilters.area && !propertyMatchesSelectedArea(property)) {
    return false;
  }

  if (activeFilters.elevator && !isYesValue(booking.elevator)) {
    return false;
  }

  if (activeFilters.confPmt && !isYesValue(booking.confPmt)) {
    return false;
  }

  return true;
}

function propertyMatchesArea(property) {
  return propertyMatchesSelectedArea(property);
}

function propertyMatchesPropertyFilters(property) {
  if (!propertyMatchesSelectedArea(property)) {
    return false;
  }

  if (activeFilters.tasks && getTasksForProperty(property).length === 0) {
    return false;
  }

  return true;
}

function propertyMatchesSelectedArea(property) {
  if (!activeFilters.area) return true;

  const area = getPropertyArea(property);

  if (activeFilters.area === "SOUTH") {
    return area === "SSB" || area === "MI";
  }

  return area === activeFilters.area;
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

  if (!hasMovingFilter()) {
    return properties.filter(propertyMatchesPropertyFilters);
  }

  const visibleRange = getCurrentVisibleRange();

  return properties.filter(property => {
    if (!propertyMatchesPropertyFilters(property)) {
      return false;
    }

    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    return bookings.some(booking => {
      if (!matchesBookingFilters(booking, property)) return false;
      if (!booking.checkIn || !booking.checkOut) return false;

      return booking.checkOut >= visibleRange.start && booking.checkIn <= visibleRange.end;
    });
  });
}

function getFilteredBookingsInView() {
  if (!hasMovingFilter()) return [];

  const visibleRange = getCurrentVisibleRange();
  const items = [];

  properties.forEach(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    bookings.forEach(booking => {
      if (!matchesBookingFilters(booking, property)) return;
      if (!booking.checkIn || !booking.checkOut) return;

      const overlaps = booking.checkOut >= visibleRange.start && booking.checkIn <= visibleRange.end;
      if (!overlaps) return;

      const tags = [];

      if (isYesValue(booking.elevator)) tags.push("ELEVATOR");
      if (isYesValue(booking.confPmt)) tags.push("CONFIRM PMT");

      const guestName = cleanGuestName(
        booking.guestName ||
        booking.guestFullName ||
        booking.fullName ||
        booking.guest?.fullName
      );

      const guestPhone = cleanPhone(
        booking.guestPhone ||
        booking.phone ||
        booking.guest?.phone
      );

      items.push({
        property: property.nickname || property.name || "Property",
        area: getPropertyArea(property),
        city: getPropertyCity(property),
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestName,
        guestPhone,
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
  const showListOption = hasMovingFilter();

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
  const activeNames = getActiveFilterNames();

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
        <div class="filtered-item-title">${escapeHtml(item.property)} (${escapeHtml(item.area)})</div>
        <div class="filtered-item-dates">IN ${escapeHtml(item.checkIn)} → OUT ${escapeHtml(item.checkOut)}</div>
        <div class="filtered-item-guest">Guest: ${guestHtml}</div>
        <div class="filtered-item-tags">${escapeHtml(item.tags.join(" • "))}</div>
      </div>
    `;
  }).join("");
}

function updateFilterButtons() {
  tasksFilterBtn.classList.toggle("active", activeFilters.tasks);
  elevatorFilterBtn.classList.toggle("active", activeFilters.elevator);
  confPmtFilterBtn.classList.toggle("active", activeFilters.confPmt);

  cityFilterSelect.value = activeFilters.area || "";
  cityFilterSelect.classList.toggle("active", Boolean(activeFilters.area));

  updateFilteredList();
}

function scheduleFilteredRerender() {
  clearTimeout(renderTimer);

  renderTimer = setTimeout(() => {
    render({ preserveScroll: true });
  }, 120);
}

function getActiveFilterNames() {
  const names = [];

  if (activeFilters.elevator) names.push("ELEVATOR");
  if (activeFilters.confPmt) names.push("CONFIRM PMT");
  if (activeFilters.tasks) names.push("TASKS");

  if (activeFilters.area === "SOUTH") {
    names.push("SOUTH END");
  } else if (activeFilters.area) {
    names.push(activeFilters.area);
  }

  return names.length ? names : ["ALL"];
}

function getPropertyCity(property) {
  return String(
    property.listingCity ||
    property.city ||
    property.addressCity ||
    property.listing?.address?.city ||
    property.address?.city ||
    ""
  ).trim();
}

function getPropertyArea(property) {
  const city = getPropertyCity(property).toLowerCase();

  if (city === "myrtle beach") return "MB";
  if (city === "north myrtle beach") return "NMB";
  if (city === "surfside beach") return "SSB";
  if (city === "murrells inlet") return "MI";

  const text = [
    property.nickname,
    property.name,
    property.address,
    property.location
  ].join(" ").toLowerCase();

  if (text.includes("north myrtle")) return "NMB";
  if (text.includes("surfside")) return "SSB";
  if (text.includes("murrells")) return "MI";
  if (text.includes("myrtle beach")) return "MB";

  return "MB";
}

/* Tasks */

function fillTaskPropertySelect() {
  taskPropertySelect.innerHTML = `<option value="">Select property</option>`;

  properties.forEach(property => {
    const option = document.createElement("option");
    option.value = property.listingId;
    option.textContent = property.nickname || property.name || "Property";
    taskPropertySelect.appendChild(option);
  });
}

function fillTaskVendorSelect(selectedName = "") {
  const names = taskVendors
    .map(vendor => vendor.name || vendor)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  taskAssigneeSelect.innerHTML = `<option value="">Choose person</option>`;

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    taskAssigneeSelect.appendChild(option);
  });

  taskAssigneeSelect.value = selectedName || "";
}

async function saveNewVendor() {
  const name = newVendorInput.value.trim();

  if (!name) {
    showNewTaskError("Please type the vendor name.");
    return;
  }

  saveVendorBtn.disabled = true;
  saveVendorBtn.textContent = "Saving...";

  try {
    const res = await fetch(TASK_VENDORS_API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to save vendor");
    }

    if (!taskVendors.some(vendor => String(vendor.name || vendor).toLowerCase() === name.toLowerCase())) {
      taskVendors.push(data.vendor || { name });
    }

    fillTaskVendorSelect(name);
    newVendorInput.value = "";
    addVendorBox.classList.add("hidden");
    newTaskError.classList.add("hidden");
  } catch (err) {
    showNewTaskError(err.message);
  } finally {
    saveVendorBtn.disabled = false;
    saveVendorBtn.textContent = "Save Vendor";
  }
}

function openNewTaskModal(property = null, task = null) {
  editingTaskId = task?.id || null;
  newTaskError.classList.add("hidden");
  newTaskError.textContent = "";
  addVendorBox.classList.add("hidden");
  taskPropertySelect.disabled = Boolean(task);
  taskPropertySelect.value = task?.listing_id || property?.listingId || "";
  taskTextInput.value = task?.task_text || "";
  fillTaskVendorSelect(task?.assignee_name || "");
  taskMediaInput.value = "";
  taskMediaPreview.innerHTML = "";
  saveTaskBtn.textContent = task ? "Save Changes" : "Save Task";
  newTaskModal.classList.remove("hidden");
  taskTextInput.focus();
}

function closeNewTaskModal() {
  newTaskModal.classList.add("hidden");
  editingTaskId = null;
  taskPropertySelect.disabled = false;
  saveTaskBtn.textContent = "Save Task";
}

async function saveNewTask() {
  const listingId = taskPropertySelect.value;
  const property = properties.find(p => p.listingId === listingId);
  const taskText = taskTextInput.value.trim();
  const assigneeName = taskAssigneeSelect.value.trim();

  newTaskError.classList.add("hidden");
  newTaskError.textContent = "";

  if (!listingId) {
    showNewTaskError("Please pick a property.");
    return;
  }

  if (!taskText) {
    showNewTaskError("Please type the task.");
    return;
  }

  saveTaskBtn.disabled = true;
  saveTaskBtn.textContent = editingTaskId ? "Saving..." : "Uploading...";

  try {
    const mediaFiles = editingTaskId ? [] : await filesToPayload(taskMediaInput.files);
    const res = await fetch(editingTaskId ? `${TASKS_API_URL}/${encodeURIComponent(editingTaskId)}` : TASKS_API_URL, {
      method: editingTaskId ? "PATCH" : "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        listingId,
        propertyName: property?.nickname || property?.name || "Property",
        taskText,
        assigneeName,
        mediaFiles
      })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to save task");
    }

    closeNewTaskModal();
    await reloadTasksOnly();

    if (activeFilters.tasks) {
      updateFilterButtons();
    }
  } catch (err) {
    showNewTaskError(err.message);
  } finally {
    saveTaskBtn.disabled = false;
    saveTaskBtn.textContent = editingTaskId ? "Save Changes" : "Save Task";
  }
}

function showNewTaskError(message) {
  newTaskError.textContent = message;
  newTaskError.classList.remove("hidden");
}

function getTasksForProperty(property) {
  return tasks.filter(task =>
    String(task.listing_id) === String(property.listingId)
  );
}

function openViewTasksModal(property) {
  selectedTaskProperty = property;

  const propertyName = property.nickname || property.name || "Property";
  const propertyTasks = getTasksForProperty(property);

  viewTasksTitle.textContent = `Tasks - ${propertyName}`;

  if (!propertyTasks.length) {
    tasksList.innerHTML = `
      <div class="task-item">
        <div class="task-text">No open tasks.</div>
      </div>
    `;
  } else {
    tasksList.innerHTML = propertyTasks.map(task => `
      <div class="task-item" data-task-id="${escapeHtml(task.id)}">
        <div class="task-text">${escapeHtml(task.task_text)}</div>
        ${task.assignee_name ? `<div class="task-assignee">Person: ${escapeHtml(task.assignee_name)}</div>` : ""}
        <div class="task-date">${formatTaskDate(task.created_at)}</div>
        ${renderTaskMedia(task.media)}
        <div class="task-actions">
          <button class="edit-task-btn" data-task-id="${escapeHtml(task.id)}">Edit</button>
          <button class="complete-task-btn" data-task-id="${escapeHtml(task.id)}">Complete</button>
        </div>
      </div>
    `).join("");
  }

  tasksList.querySelectorAll(".edit-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const task = tasks.find(item => String(item.id) === String(btn.dataset.taskId));
      if (!task) return;
      closeViewTasksModal();
      openNewTaskModal(property, task);
    });
  });

  tasksList.querySelectorAll(".complete-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openCompleteTaskModal(btn.dataset.taskId);
    });
  });

  viewTasksModal.classList.remove("hidden");
}

function closeViewTasksModal(options = {}) {
  viewTasksModal.classList.add("hidden");
  if (!options.keepProperty) {
    selectedTaskProperty = null;
  }
}

function openCompleteTaskModal(taskId) {
  pendingCompleteTaskId = taskId;
  completeTaskError.classList.add("hidden");
  completeTaskError.textContent = "";
  completeUploadBox.classList.add("hidden");
  completeMediaInput.value = "";
  completeMediaPreview.innerHTML = "";
  completeYesBtn.classList.remove("hidden");
  finishCompleteTaskBtn.classList.add("hidden");
  completeTaskModal.classList.remove("hidden");
}

function closeCompleteTaskModal() {
  completeTaskModal.classList.add("hidden");
  pendingCompleteTaskId = null;
}

async function finishCompleteTask(includeMedia) {
  const taskId = pendingCompleteTaskId;

  if (!taskId) return;

  completeNoBtn.disabled = true;
  completeYesBtn.disabled = true;
  finishCompleteTaskBtn.disabled = true;

  try {
    const mediaFiles = includeMedia ? await filesToPayload(completeMediaInput.files) : [];

    const res = await fetch(`${TASKS_API_URL}/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ mediaFiles })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to complete task");
    }

    await reloadTasksOnly();
    closeCompleteTaskModal();

    if (selectedTaskProperty) {
      const stillHasTasks = getTasksForProperty(selectedTaskProperty).length > 0;

      if (stillHasTasks) {
        openViewTasksModal(selectedTaskProperty);
      } else {
        closeViewTasksModal();
      }
    }
  } catch (err) {
    completeTaskError.textContent = err.message;
    completeTaskError.classList.remove("hidden");
  } finally {
    completeNoBtn.disabled = false;
    completeYesBtn.disabled = false;
    finishCompleteTaskBtn.disabled = false;
  }
}

function renderTaskMedia(media = []) {
  if (!Array.isArray(media) || !media.length) return "";

  return `
    <div class="task-media-grid">
      ${media.map(item => {
        const url = escapeHtml(item.file_url);
        const name = escapeHtml(item.file_name || "Upload");

        if (item.media_kind === "video" || String(item.file_type || "").startsWith("video/")) {
          return `<a class="task-media-link" href="${url}" target="_blank" rel="noopener">Video: ${name}</a>`;
        }

        return `<a class="task-media-thumb" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}"></a>`;
      }).join("")}
    </div>
  `;
}

function renderFilePreview(fileList, target) {
  const files = Array.from(fileList || []);

  if (!files.length) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = files.map(file => `
    <div class="media-preview-item">
      <span>${escapeHtml(file.name)}</span>
      <small>${Math.ceil(file.size / 1024)} KB</small>
    </div>
  `).join("");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      dataUrl: reader.result
    });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function filesToPayload(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(files.map(fileToDataUrl));
}

function formatTaskDate(value) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* Helpers */

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
