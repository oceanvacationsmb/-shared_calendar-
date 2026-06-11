const API_URL = "https://shared-calendar-api.onrender.com/api/calendar-all";
const TASKS_API_URL = "https://shared-calendar-api.onrender.com/api/calendar-tasks";
const TASK_VENDORS_API_URL = "https://shared-calendar-api.onrender.com/api/calendar-task-vendors";
const TASK_CREATORS_API_URL = "https://shared-calendar-api.onrender.com/api/calendar-task-creators";
const LOCKS_API_URL = "https://shared-calendar-api.onrender.com/api/locks-status";
const GAPS_API_BASE_URL = "https://shared-calendar-api.onrender.com/api/gaps";

const DAYS_TO_SHOW = 45;
const DAYS_BEFORE_TODAY = 5;
const VISIBLE_DAY_COUNT = DAYS_TO_SHOW + DAYS_BEFORE_TODAY + 1;

const calendarEl = document.getElementById("calendar");
const calendarWrap = document.getElementById("calendarWrap");
const todayBtn = document.getElementById("todayBtn");
const propertyListEl = document.getElementById("propertyList");

const newTaskBtn = document.getElementById("newTaskBtn");
const taskMenuBtn = document.getElementById("taskMenuBtn");
const taskMenuLabel = document.getElementById("taskMenuLabel");
const taskMenuDropdown = document.getElementById("taskMenuDropdown");
const taskMenuActiveCount = document.getElementById("taskMenuActiveCount");
const tasksFilterBtn = document.getElementById("tasksFilterBtn");
const completedTasksBtn = document.getElementById("completedTasksBtn");
const taskListBtn = document.getElementById("taskListBtn");
const totalTasksBadge = document.getElementById("totalTasksBadge");
const elevatorFilterBtn = document.getElementById("elevatorFilterBtn");
const elevatorBadge = document.getElementById("elevatorBadge");
const confPmtFilterBtn = document.getElementById("confPmtFilterBtn");
const confPmtBadge = document.getElementById("confPmtBadge");
const cityFilterSelect = document.getElementById("cityFilterSelect");
const lockMenuBtn = document.getElementById("lockMenuBtn");
const lockMenuLabel = document.getElementById("lockMenuLabel");
const lockMenuDropdown = document.getElementById("lockMenuDropdown");
const lockAlertBadge = document.getElementById("lockAlertBadge");
const batteryFilterBtn = document.getElementById("batteryFilterBtn");
const batteryBadge = document.getElementById("batteryBadge");
const wifiFilterBtn = document.getElementById("wifiFilterBtn");
const wifiBadge = document.getElementById("wifiBadge");

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
const taskCreatorSelect = document.getElementById("taskCreatorSelect");
const showManageCreatorsBtn = document.getElementById("showManageCreatorsBtn");
const manageCreatorsBox = document.getElementById("manageCreatorsBox");
const newCreatorInput = document.getElementById("newCreatorInput");
const saveCreatorBtn = document.getElementById("saveCreatorBtn");
const creatorNamesList = document.getElementById("creatorNamesList");
const newTaskError = document.getElementById("newTaskError");
const gapsBtn = document.getElementById("gapsBtn");
const gapsModal = document.getElementById("gapsModal");
const closeGapsBtn = document.getElementById("closeGapsBtn");
const loadGapsBtn = document.getElementById("loadGapsBtn");
const scanGapsBtn = document.getElementById("scanGapsBtn");
const gapsStatus = document.getElementById("gapsStatus");
const gapsResults = document.getElementById("gapsResults");

const viewTasksModal = document.getElementById("viewTasksModal");
const closeViewTasksBtn = document.getElementById("closeViewTasksBtn");
const doneViewTasksBtn = document.getElementById("doneViewTasksBtn");
const addTaskForPropertyBtn = document.getElementById("addTaskForPropertyBtn");
const viewTasksTitle = document.getElementById("viewTasksTitle");
const tasksList = document.getElementById("tasksList");

let dates = [];
let properties = [];
let tasks = [];
let completedTasks = [];
let taskVendors = [];
let taskCreators = [];
let lockStatuses = [];
let isSyncingScroll = false;
let isListOpen = false;
let renderTimer = null;
let selectedTaskProperty = null;
let editingTaskId = null;
let viewingCompletedTasks = false;
let gapsPollTimer = null;

let activeFilters = {
  elevator: false,
  confPmt: false,
  tasks: false,
  area: null,
  lock: null
};

todayBtn.addEventListener("click", () => {
  scrollToToday(true);
});

warmGapsService();

newTaskBtn.addEventListener("click", () => {
  closeTaskMenu();
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

showManageCreatorsBtn.addEventListener("click", () => {
  manageCreatorsBox.classList.toggle("hidden");
  renderCreatorNamesList();
  newCreatorInput.focus();
});

saveCreatorBtn.addEventListener("click", () => {
  saveNewCreator();
});

closeViewTasksBtn.addEventListener("click", closeViewTasksModal);
doneViewTasksBtn.addEventListener("click", closeViewTasksModal);
addTaskForPropertyBtn.addEventListener("click", () => {
  if (!selectedTaskProperty) return;

  const property = selectedTaskProperty;
  closeViewTasksModal();
  openNewTaskModal(property);
});

taskMediaInput.addEventListener("change", () => {
  renderFilePreview(taskMediaInput.files, taskMediaPreview);
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

gapsBtn.addEventListener("click", () => {
  openGapsModal();
});

closeGapsBtn.addEventListener("click", closeGapsModal);
loadGapsBtn.addEventListener("click", loadGapProperties);
scanGapsBtn.addEventListener("click", startGapScan);

gapsModal.addEventListener("click", event => {
  if (event.target === gapsModal) {
    closeGapsModal();
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
  closeTaskMenu();
  activeFilters.tasks = !activeFilters.tasks;
  activeFilters.elevator = false;
  activeFilters.confPmt = false;
  isListOpen = false;

  updateFilterButtons();
  render();
});

completedTasksBtn.addEventListener("click", () => {
  closeTaskMenu();
  taskMenuLabel.textContent = "COMPLETED TASKS";
  totalTasksBadge.classList.add("hidden");
  openCompletedTasksModal();
});

taskListBtn.addEventListener("click", () => {
  closeTaskMenu();
  taskMenuLabel.textContent = "TASK LIST";
  totalTasksBadge.classList.add("hidden");
  openTaskListModal();
});

taskMenuBtn.addEventListener("click", event => {
  event.stopPropagation();
  closeLockMenu();
  taskMenuDropdown.classList.toggle("hidden");
});

lockMenuBtn.addEventListener("click", event => {
  event.stopPropagation();
  closeTaskMenu();
  lockMenuDropdown.classList.toggle("hidden");
});

document.addEventListener("click", event => {
  if (!event.target.closest(".task-menu")) {
    closeTaskMenu();
    closeLockMenu();
  }
});

batteryFilterBtn.addEventListener("click", () => {
  closeLockMenu();
  activeFilters.lock = activeFilters.lock === "battery" ? null : "battery";

  updateFilterButtons();
  render();
});

wifiFilterBtn.addEventListener("click", () => {
  closeLockMenu();
  activeFilters.lock = activeFilters.lock === "wifi" ? null : "wifi";

  updateFilterButtons();
  render();
});

elevatorFilterBtn.addEventListener("click", () => {
  closeTaskMenu();
  activeFilters.area = null;
  activeFilters.tasks = false;
  cityFilterSelect.value = "";

  activeFilters.elevator = !activeFilters.elevator;
  activeFilters.confPmt = false;

  updateFilterButtons();
  render();
});

confPmtFilterBtn.addEventListener("click", () => {
  closeTaskMenu();
  activeFilters.area = null;
  activeFilters.tasks = false;
  cityFilterSelect.value = "";

  activeFilters.confPmt = !activeFilters.confPmt;
  activeFilters.elevator = false;

  updateFilterButtons();
  render();
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

function warmGapsService() {
  fetch(`${GAPS_API_BASE_URL}/warmup?v=${Date.now()}`, {
    cache: "no-store"
  }).catch(() => {
    // Warmup is best-effort; the GAPS popup will show the real error if needed.
  });
}

async function loadCalendar() {
  calendarEl.innerHTML = `<div class="loading">Loading calendar...</div>`;
  propertyListEl.innerHTML = "";

  const today = todayString();
  const start = addDays(today, -DAYS_BEFORE_TODAY);
  const end = addDays(today, DAYS_TO_SHOW + 1);

  dates = buildDates(start, VISIBLE_DAY_COUNT);

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    const [calendarResponse, tasksResponse, vendorsResponse, creatorsResponse, locksResponse] = await Promise.all([
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
      }),
      fetch(`${TASK_CREATORS_API_URL}?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(`${LOCKS_API_URL}?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      })
    ]);

    clearTimeout(timeout);

    const data = await calendarResponse.json();
    const tasksData = await tasksResponse.json();
    const vendorsData = await vendorsResponse.json();
    const creatorsData = await creatorsResponse.json();
    const locksData = await locksResponse.json();

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
    taskCreators = creatorsResponse.ok && creatorsData.ok
      ? creatorsData.creators || []
      : (creatorsData.defaultCreators || []).map(name => ({ name }));
    lockStatuses = locksResponse.ok && locksData.ok ? locksData.locks || [] : [];

    render();
    fillTaskPropertySelect();
    fillTaskVendorSelect();
    fillTaskCreatorSelect();

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
    name.textContent = getCompactPropertyName(property);
    row.appendChild(name);

    const status = document.createElement("div");
    status.className = "property-status";

    const lockGroup = document.createElement("div");
    lockGroup.className = "property-lock";

    const lockStatus = getLockStatusForProperty(property);

    if (lockStatus) {
      const battery = document.createElement("span");
      battery.className = getBatteryClass(lockStatus);
      battery.textContent = formatBattery(lockStatus);
      battery.title = `Lock battery ${formatBattery(lockStatus)}`;
      lockGroup.appendChild(battery);

      const online = document.createElement("span");
      online.className = lockStatus.online ? "lock-online online" : "lock-online offline";
      online.innerHTML = `
        <span class="wifi-bars" aria-hidden="true"><span></span><span></span><span></span></span>
      `;
      online.title = lockStatus.online ? "Lock online" : "Lock offline";
      online.setAttribute("aria-label", lockStatus.online ? "Lock online" : "Lock offline");
      lockGroup.appendChild(online);
    }

    status.appendChild(lockGroup);

    const taskGroup = document.createElement("div");
    taskGroup.className = "property-task";
    const propertyTasks = getTasksForProperty(property);

    if (propertyTasks.length) {
      const badge = document.createElement("button");
      badge.className = "task-badge";
      badge.innerHTML = `
        <span class="task-badge-bell" aria-hidden="true">!</span>
        <span>${propertyTasks.length}</span>
      `;
      badge.setAttribute("aria-label", `${propertyTasks.length} task${propertyTasks.length === 1 ? "" : "s"}`);
      badge.addEventListener("click", event => {
        event.stopPropagation();
        openViewTasksModal(property);
      });

      taskGroup.appendChild(badge);
    }

    status.appendChild(taskGroup);
    row.appendChild(status);

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
        empty.textContent = "OPEN";
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

  const visibleBookings = shouldShowAllBookingsForFilteredProperty()
    ? bookings
    : bookings.filter(booking => matchesBookingFilters(booking, property));

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

    if (isYesValue(booking.elevator)) {
      bar.classList.add("elevator-booking");
    }

    if (isYesValue(booking.confPmt)) {
      bar.classList.add("payment-issue-booking");
    }

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
      extraLabels.push("PAYMENT ISSUE");
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
      renderCheckoutOpenHalf(row, checkOutIndex);
    }
  });
}

function renderCheckoutOpenHalf(row, dateIndex) {
  if (row.querySelector(`[data-checkout-no-stay="${dateIndex}"]`)) return;

  const box = document.createElement("div");
  box.className = "checkout-no-stay";
  box.dataset.checkoutNoStay = dateIndex;

  box.style.left = `calc(${dateIndex} * var(--day-width) + (var(--day-width) / 2) - 4px)`;
  box.style.width = `calc((var(--day-width) / 2) + 4px)`;

  box.textContent = "OPEN";

  row.appendChild(box);
}

function shouldShowAllBookingsForFilteredProperty() {
  return Boolean(activeFilters.elevator || activeFilters.confPmt);
}

function isCoveredByAnyBooking(property, date) {
  const bookings = Array.isArray(property.bookings) ? property.bookings : [];
  const relevantBookings = shouldShowAllBookingsForFilteredProperty()
    ? bookings
    : bookings.filter(booking => matchesBookingFilters(booking, property));

  return relevantBookings
    .some(booking => {
      if (!booking.checkIn || !booking.checkOut) return false;
      return date >= booking.checkIn && date <= booking.checkOut;
    });
}

function hasAnyActiveFilter() {
  return Boolean(activeFilters.elevator || activeFilters.confPmt || activeFilters.tasks || activeFilters.area || activeFilters.lock);
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

  if (activeFilters.lock && !propertyMatchesLockFilter(property)) {
    return false;
  }

  return true;
}

function propertyMatchesLockFilter(property) {
  const lockStatus = getLockStatusForProperty(property);

  if (!lockStatus) return false;

  if (activeFilters.lock === "battery") {
    return hasBatteryIssue(lockStatus);
  }

  if (activeFilters.lock === "wifi") {
    return lockStatus.online === false;
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
      if (isYesValue(booking.confPmt)) tags.push("PAYMENT ISSUE");

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
  filteredListPanel.classList.add("hidden");
  document.body.classList.remove("list-open");
  isListOpen = false;
  return;

  const showListOption = hasMovingFilter();

  if (!showListOption) {
    filteredListPanel.classList.add("hidden");
    document.body.classList.remove("list-open");
    return;
  }

  filteredListPanel.classList.toggle("hidden", !isListOpen);
  document.body.classList.toggle("list-open", isListOpen);

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
  const taskCount = tasks.length;
  const elevatorCount = getElevatorReservationCount();
  const paymentIssueCount = getConfPmtReservationCount();
  const batteryIssueCount = getBatteryIssueCount();
  const offlineLockCount = getOfflineLockCount();

  updateTaskNotification(taskCount, elevatorCount, paymentIssueCount);
  updateLockNotification(batteryIssueCount, offlineLockCount);
  updateElevatorNotification(elevatorCount);
  updateConfPmtNotification(paymentIssueCount);
  tasksFilterBtn.classList.toggle("active", activeFilters.tasks);
  elevatorFilterBtn.classList.toggle("active", activeFilters.elevator);
  confPmtFilterBtn.classList.toggle("active", activeFilters.confPmt);
  batteryFilterBtn.classList.toggle("active", activeFilters.lock === "battery");
  wifiFilterBtn.classList.toggle("active", activeFilters.lock === "wifi");

  cityFilterSelect.value = activeFilters.area || "";
  cityFilterSelect.classList.toggle("active", Boolean(activeFilters.area));

  updateFilteredList();
}

function updateElevatorNotification(count) {
  elevatorBadge.textContent = String(count);
  elevatorBadge.classList.toggle("hidden", count === 0);
}

function updateTaskNotification(taskCount, elevatorCount, paymentIssueCount) {
  let label = "TASKS";
  let count = taskCount;

  if (activeFilters.elevator) {
    label = "ELEVATORS";
    count = elevatorCount;
  } else if (activeFilters.confPmt) {
    label = "PAYMENT ISSUES";
    count = paymentIssueCount;
  } else if (activeFilters.tasks) {
    label = "ACTIVE TASKS";
    count = taskCount;
  }

  totalTasksBadge.textContent = String(count);
  taskMenuActiveCount.textContent = String(taskCount);
  taskMenuLabel.textContent = label;
  totalTasksBadge.classList.toggle("hidden", count === 0);
  taskMenuActiveCount.classList.toggle("hidden", taskCount === 0);
  taskMenuBtn.classList.toggle("has-tasks", count > 0);
  tasksFilterBtn.classList.toggle("active", activeFilters.tasks);
}

function closeTaskMenu() {
  taskMenuDropdown.classList.add("hidden");
}

function closeLockMenu() {
  lockMenuDropdown.classList.add("hidden");
}

function updateLockNotification(batteryIssueCount, offlineLockCount) {
  let label = "LOCKS";
  let count = batteryIssueCount + offlineLockCount;

  if (activeFilters.lock === "battery") {
    label = "BATTERY";
    count = batteryIssueCount;
  } else if (activeFilters.lock === "wifi") {
    label = "WIFI";
    count = offlineLockCount;
  }

  lockMenuLabel.textContent = label;
  lockAlertBadge.textContent = String(count);
  batteryBadge.textContent = String(batteryIssueCount);
  wifiBadge.textContent = String(offlineLockCount);
  lockAlertBadge.classList.toggle("hidden", count === 0);
  batteryBadge.classList.toggle("hidden", batteryIssueCount === 0);
  wifiBadge.classList.toggle("hidden", offlineLockCount === 0);
  lockMenuBtn.classList.toggle("active", Boolean(activeFilters.lock));
  lockMenuBtn.classList.toggle("has-lock-alerts", count > 0);
}

function updateConfPmtNotification(count) {
  confPmtBadge.textContent = String(count);
  confPmtBadge.classList.toggle("hidden", count === 0);
  confPmtFilterBtn.classList.toggle("has-conf-pmt", count > 0);
}

function getConfPmtReservationCount() {
  let count = 0;

  properties.forEach(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    bookings.forEach(booking => {
      if (!isYesValue(booking.confPmt)) return;
      if (!booking.checkIn || !booking.checkOut) return;
      if (booking.checkOut < dates[0] || booking.checkIn > dates[dates.length - 1]) return;

      count += 1;
    });
  });

  return count;
}

function getElevatorReservationCount() {
  let count = 0;

  properties.forEach(property => {
    const bookings = Array.isArray(property.bookings) ? property.bookings : [];

    bookings.forEach(booking => {
      if (!isYesValue(booking.elevator)) return;
      if (!booking.checkIn || !booking.checkOut) return;
      if (booking.checkOut < dates[0] || booking.checkIn > dates[dates.length - 1]) return;

      count += 1;
    });
  });

  return count;
}

function getBatteryIssueCount() {
  return properties.filter(property => {
    const lockStatus = getLockStatusForProperty(property);
    return lockStatus && hasBatteryIssue(lockStatus);
  }).length;
}

function getOfflineLockCount() {
  return properties.filter(property => {
    const lockStatus = getLockStatusForProperty(property);
    return lockStatus && lockStatus.online === false;
  }).length;
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
  if (activeFilters.confPmt) names.push("PAYMENT ISSUES");
  if (activeFilters.tasks) names.push("TASKS");
  if (activeFilters.lock === "battery") names.push("BATTERY");
  if (activeFilters.lock === "wifi") names.push("WIFI");

  if (activeFilters.area === "SOUTH") {
    names.push("SOUTH END");
  } else if (activeFilters.area === "MB") {
    names.push("CENTRAL MB");
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

function normalizePropertyKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(mb|gc|gcssb|ssb|nmb|mi)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getCompactPropertyName(property) {
  const name = property.nickname || property.name || "Property";
  return String(name)
    .replace(/^\s*(MB|GC|GCSSB|SSB|NMB|MI)\s*[-–]\s*/i, "")
    .trim();
}

function getLockStatusForProperty(property) {
  if (!lockStatuses.length) {
    return {
      batteryPercent: 80,
      online: true,
      provider: "Demo"
    };
  }

  const names = [
    property.nickname,
    property.name,
    getCompactPropertyName(property)
  ].filter(Boolean);

  const keys = names.map(normalizePropertyKey).filter(Boolean);

  return lockStatuses.find(lock => {
    const lockKeys = [
      lock.propertyKey,
      normalizePropertyKey(lock.propertyName),
      normalizePropertyKey(lock.lockName)
    ].filter(Boolean);

    return keys.some(key => lockKeys.includes(key) || lockKeys.some(lockKey => lockKey.includes(key) || key.includes(lockKey)));
  }) || null;
}

function formatBattery(lockStatus) {
  const pct = Number(lockStatus.batteryPercent);

  if (Number.isFinite(pct) && pct >= 0) {
    return `${pct}%`;
  }

  return lockStatus.batteryStatus || "--";
}

function getBatteryClass(lockStatus) {
  const pct = Number(lockStatus.batteryPercent);

  if (Number.isFinite(pct)) {
    if (pct <= 20) return "lock-battery low";
    if (pct <= 50) return "lock-battery medium";
    return "lock-battery good";
  }

  const status = String(lockStatus.batteryStatus || "").toLowerCase();
  if (status.includes("low")) return "lock-battery low";
  return "lock-battery good";
}

function hasBatteryIssue(lockStatus) {
  const pct = Number(lockStatus?.batteryPercent);

  if (Number.isFinite(pct) && pct >= 0) {
    return pct <= 50;
  }

  const status = String(lockStatus?.batteryStatus || "").toLowerCase();
  return status.includes("low") || status.includes("medium");
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

function fillTaskCreatorSelect(selectedName = "") {
  const names = taskCreators
    .map(creator => creator.name || creator)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  taskCreatorSelect.innerHTML = `<option value="">Choose name</option>`;

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    taskCreatorSelect.appendChild(option);
  });

  taskCreatorSelect.value = selectedName || "";
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

async function saveNewCreator() {
  const name = newCreatorInput.value.trim();

  if (!name) {
    showNewTaskError("Please type the name.");
    return;
  }

  saveCreatorBtn.disabled = true;
  saveCreatorBtn.textContent = "Saving...";

  try {
    const res = await fetch(TASK_CREATORS_API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to save name");
    }

    if (!taskCreators.some(creator => String(creator.name || creator).toLowerCase() === name.toLowerCase())) {
      taskCreators.push(data.creator || { name });
    }

    fillTaskCreatorSelect(name);
    renderCreatorNamesList();
    newCreatorInput.value = "";
    newTaskError.classList.add("hidden");
  } catch (err) {
    showNewTaskError(err.message);
  } finally {
    saveCreatorBtn.disabled = false;
    saveCreatorBtn.textContent = "Save Name";
  }
}

function renderCreatorNamesList() {
  if (!taskCreators.length) {
    creatorNamesList.innerHTML = `<div class="creator-empty">No names yet.</div>`;
    return;
  }

  creatorNamesList.innerHTML = taskCreators
    .slice()
    .sort((a, b) => String(a.name || a).localeCompare(String(b.name || b)))
    .map(creator => `
      <div class="creator-name-row" data-creator-id="${escapeHtml(creator.id || "")}">
        <input class="creator-name-input" value="${escapeHtml(creator.name || creator)}" ${creator.id ? "" : "disabled"} />
        <button class="creator-update-btn" type="button" ${creator.id ? "" : "disabled"}>Update</button>
        <button class="creator-delete-btn" type="button" ${creator.id ? "" : "disabled"}>Delete</button>
      </div>
    `).join("");

  creatorNamesList.querySelectorAll(".creator-name-row").forEach(row => {
    const id = row.dataset.creatorId;
    const input = row.querySelector(".creator-name-input");
    const updateBtn = row.querySelector(".creator-update-btn");
    const deleteBtn = row.querySelector(".creator-delete-btn");

    updateBtn.addEventListener("click", () => updateCreatorName(id, input.value.trim()));
    deleteBtn.addEventListener("click", () => deleteCreatorName(id));
  });
}

async function updateCreatorName(id, name) {
  if (!id || !name) return;

  try {
    const res = await fetch(`${TASK_CREATORS_API_URL}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to update name");
    }

    taskCreators = taskCreators.map(creator => String(creator.id) === String(id) ? data.creator : creator);
    fillTaskCreatorSelect(taskCreatorSelect.value);
    renderCreatorNamesList();
  } catch (err) {
    showNewTaskError(err.message);
  }
}

async function deleteCreatorName(id) {
  if (!id) return;

  try {
    const res = await fetch(`${TASK_CREATORS_API_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to delete name");
    }

    taskCreators = taskCreators.filter(creator => String(creator.id) !== String(id));
    fillTaskCreatorSelect();
    renderCreatorNamesList();
  } catch (err) {
    showNewTaskError(err.message);
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
  fillTaskCreatorSelect(task?.created_by_name || "");
  manageCreatorsBox.classList.add("hidden");
  renderCreatorNamesList();
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
  const createdByName = taskCreatorSelect.value.trim();

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
        createdByName,
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
  viewingCompletedTasks = false;
  addTaskForPropertyBtn.classList.remove("hidden");

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
        ${task.created_by_name ? `<div class="task-assignee">Added by: ${escapeHtml(task.created_by_name)}</div>` : ""}
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
      completeTask(btn.dataset.taskId);
    });
  });

  viewTasksModal.classList.remove("hidden");
}

function closeViewTasksModal(options = {}) {
  viewTasksModal.classList.add("hidden");
  viewingCompletedTasks = false;
  if (!options.keepProperty) {
    selectedTaskProperty = null;
  }
}

function openGapsModal() {
  gapsModal.classList.remove("hidden");

  if (!gapsResults.innerHTML.trim()) {
    loadGapProperties();
  }
}

function closeGapsModal() {
  gapsModal.classList.add("hidden");
  clearTimeout(gapsPollTimer);
}

function setGapsStatus(message, type = "") {
  gapsStatus.className = `gaps-status ${type}`.trim();
  gapsStatus.textContent = message;
}

async function gapsApi(path, options = {}) {
  const res = await fetch(`${GAPS_API_BASE_URL}${path}?v=${Date.now()}`, {
    cache: "no-store",
    ...options
  });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.message || "Gaps request failed");
  }

  return data;
}

async function loadGapProperties() {
  clearTimeout(gapsPollTimer);
  loadGapsBtn.disabled = true;

  try {
    setGapsStatus("Loading enabled gap properties...");
    const data = await gapsApi("/enabled-listings");
    const listings = data.listings || [];

    gapsResults.innerHTML = listings.length
      ? `
        <div class="gaps-summary">${listings.length} enabled properties</div>
        ${listings.map(listing => `
          <div class="gaps-row">${escapeHtml(listing.title || listing.id || "Property")}</div>
        `).join("")}
      `
      : `<div class="gaps-empty">No gap properties are enabled yet.</div>`;

    setGapsStatus("Ready to scan.");
  } catch (err) {
    gapsResults.innerHTML = "";
    setGapsStatus(err.message, "error");
  } finally {
    loadGapsBtn.disabled = false;
  }
}

async function startGapScan() {
  clearTimeout(gapsPollTimer);
  scanGapsBtn.disabled = true;
  loadGapsBtn.disabled = true;

  try {
    setGapsStatus("Starting gap scan...");
    gapsResults.innerHTML = "";
    await gapsApi("/scan", {
      method: "POST"
    });
    pollGapScan();
  } catch (err) {
    setGapsStatus(err.message, "error");
    scanGapsBtn.disabled = false;
    loadGapsBtn.disabled = false;
  }
}

async function pollGapScan() {
  gapsPollTimer = null;

  try {
    const data = await gapsApi("/scan-status");
    const job = data.job || {};

    if (job.state === "running") {
      setGapsStatus("Scanning enabled properties... this can take a few minutes.");
      gapsPollTimer = setTimeout(pollGapScan, 2500);
      return;
    }

    if (job.state === "failed") {
      throw new Error(job.error || "Gap scan failed");
    }

    if (job.state !== "completed") {
      setGapsStatus("Scan is waiting to start...");
      gapsPollTimer = setTimeout(pollGapScan, 2500);
      return;
    }

    renderGapResults(job.result || {});
    setGapsStatus("Gap scan complete.", "success");
  } catch (err) {
    setGapsStatus(err.message, "error");
  } finally {
    if (!gapsPollTimer) {
      scanGapsBtn.disabled = false;
      loadGapsBtn.disabled = false;
    }
  }
}

function renderGapResults(data) {
  const listings = data.listings || [];
  const count = data.dryRun ? data.adjustmentCount : data.appliedCount;
  const summary = data.dryRun
    ? `${count || 0} proposed adjustments. DRY RUN is on.`
    : `${count || 0} adjustments applied.`;

  gapsResults.innerHTML = `
    <div class="gaps-summary">${escapeHtml(summary)}</div>
    ${listings.map(listing => {
      const adjustments = listing.adjustments || [];
      return `
        <div class="gaps-result">
          <div class="gaps-result-title">
            <span>${escapeHtml(listing.title || listing.id || "Property")}</span>
            <strong>${adjustments.length}</strong>
          </div>
          ${adjustments.length
            ? `<ul>${adjustments.map(adjustment => `
              <li>${escapeHtml(adjustment.date)}: ${escapeHtml(adjustment.fromMinNights)} -> ${escapeHtml(adjustment.toMinNights)} nights</li>
            `).join("")}</ul>`
            : `<div class="gaps-empty">No eligible gaps found.</div>`}
        </div>
      `;
    }).join("")}
  `;
}

async function completeTask(taskId) {
  if (!taskId) return;

  try {
    const res = await fetch(`${TASKS_API_URL}/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to complete task");
    }

    await reloadTasksOnly();

    if (selectedTaskProperty) {
      const stillHasTasks = getTasksForProperty(selectedTaskProperty).length > 0;

      if (stillHasTasks) {
        openViewTasksModal(selectedTaskProperty);
      } else {
        closeViewTasksModal();
      }
    }
  } catch (err) {
    alert(err.message);
  }
}

async function openCompletedTasksModal() {
  viewingCompletedTasks = true;
  selectedTaskProperty = null;
  viewTasksTitle.textContent = "Completed Tasks - last 45 days";
  tasksList.innerHTML = `<div class="task-item"><div class="task-text">Loading completed tasks...</div></div>`;
  addTaskForPropertyBtn.classList.add("hidden");
  viewTasksModal.classList.remove("hidden");

  try {
    const res = await fetch(`${TASKS_API_URL}?status=completed&v=${Date.now()}`, {
      cache: "no-store"
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to load completed tasks");
    }

    completedTasks = data.tasks || [];

    if (!completedTasks.length) {
      tasksList.innerHTML = `<div class="task-item"><div class="task-text">No completed tasks in the last 45 days.</div></div>`;
      return;
    }

    tasksList.innerHTML = completedTasks.map(task => `
      <div class="task-item completed-task-item" data-task-id="${escapeHtml(task.id)}">
        <div class="task-text">${escapeHtml(task.task_text)}</div>
        <div class="task-assignee">${escapeHtml(task.property_name || "Property")}</div>
        ${task.assignee_name ? `<div class="task-assignee">Person: ${escapeHtml(task.assignee_name)}</div>` : ""}
        ${task.created_by_name ? `<div class="task-assignee">Added by: ${escapeHtml(task.created_by_name)}</div>` : ""}
        ${task.completed_by_name ? `<div class="task-assignee">Completed by: ${escapeHtml(task.completed_by_name)}</div>` : ""}
        <div class="task-date">Completed: ${formatTaskDate(task.completed_at)}</div>
        ${renderTaskMedia(task.media)}
        <div class="task-actions">
          <button class="delete-completed-task-btn" data-task-id="${escapeHtml(task.id)}">Delete</button>
        </div>
      </div>
    `).join("");

    tasksList.querySelectorAll(".delete-completed-task-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        deleteCompletedTask(btn.dataset.taskId);
      });
    });
  } catch (err) {
    tasksList.innerHTML = `<div class="task-item"><div class="task-text">${escapeHtml(err.message)}</div></div>`;
  }
}

function openTaskListModal() {
  viewingCompletedTasks = false;
  selectedTaskProperty = null;
  viewTasksTitle.textContent = "Task List";
  addTaskForPropertyBtn.classList.add("hidden");

  if (!tasks.length) {
    tasksList.innerHTML = `<div class="task-item"><div class="task-text">No active tasks.</div></div>`;
    viewTasksModal.classList.remove("hidden");
    return;
  }

  const groups = properties
    .map(property => ({
      property,
      propertyName: getCompactPropertyName(property),
      tasks: getTasksForProperty(property)
    }))
    .filter(group => group.tasks.length)
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName));

  tasksList.innerHTML = groups.map(group => `
    <div class="task-property-group">
      <div class="task-property-title">
        <span>${escapeHtml(group.propertyName)}</span>
        <span>${group.tasks.length}</span>
      </div>
      ${group.tasks.map(task => `
        <div class="task-item compact-task-item" data-task-id="${escapeHtml(task.id)}">
          <div class="task-text">${escapeHtml(task.task_text)}</div>
          ${task.assignee_name ? `<div class="task-assignee">Person: ${escapeHtml(task.assignee_name)}</div>` : ""}
          ${task.created_by_name ? `<div class="task-assignee">Added by: ${escapeHtml(task.created_by_name)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `).join("");

  viewTasksModal.classList.remove("hidden");
}

async function deleteCompletedTask(taskId) {
  if (!taskId) return;

  try {
    const res = await fetch(`${TASKS_API_URL}/${encodeURIComponent(taskId)}?hard=true`, {
      method: "DELETE",
      cache: "no-store"
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Failed to delete completed task");
    }

    completedTasks = completedTasks.filter(task => String(task.id) !== String(taskId));
    openCompletedTasksModal();
  } catch (err) {
    alert(err.message);
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
