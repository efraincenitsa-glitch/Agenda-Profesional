const STORAGE_KEY = "agenda_pro_html_v2";
const DEFAULT_CATEGORY = "Trabajo";

/*
  REEMPLAZA esta clave por tu VAPID PUBLIC KEY real.
  Ejemplo:
  const VAPID_PUBLIC_KEY = "BEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
*/
const VAPID_PUBLIC_KEY = "AQUI_TU_CLAVE_PUBLICA_VAPID";

const CATEGORIES = [
  { name: "Trabajo", color: "#2563eb" },
  { name: "Personal", color: "#9333ea" },
  { name: "Salud", color: "#059669" },
  { name: "Finanzas", color: "#d97706" },
  { name: "Importante", color: "#dc2626" }
];

const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 180, 1440];
const daysShort = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

let events = loadEvents();
let monthCursor = new Date();
let selectedDate = formatDateKey(new Date());
let search = "";
let categoryFilter = "Todas";
let notificationPermission = typeof Notification !== "undefined"
  ? Notification.permission
  : "default";

const els = {
  monthTitle: document.getElementById("monthTitle"),
  daysHead: document.getElementById("daysHead"),
  calendarGrid: document.getElementById("calendarGrid"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  dayEvents: document.getElementById("dayEvents"),
  upcomingEvents: document.getElementById("upcomingEvents"),
  searchInput: document.getElementById("searchInput"),
  categoryFilter: document.getElementById("categoryFilter"),
  btnToday: document.getElementById("btnToday"),
  btnPrevMonth: document.getElementById("btnPrevMonth"),
  btnNextMonth: document.getElementById("btnNextMonth"),
  btnEnableNotifications: document.getElementById("btnEnableNotifications"),
  btnOpenForm: document.getElementById("btnOpenForm"),
  btnAddSelectedDate: document.getElementById("btnAddSelectedDate"),
  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  fileInput: document.getElementById("fileInput"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  btnCancel: document.getElementById("btnCancel"),
  btnSave: document.getElementById("btnSave"),
  toast: document.getElementById("toast"),
  statTotal: document.getElementById("statTotal"),
  statToday: document.getElementById("statToday"),
  statWeek: document.getElementById("statWeek"),
  statHigh: document.getElementById("statHigh"),
  title: document.getElementById("title"),
  category: document.getElementById("category"),
  date: document.getElementById("date"),
  priority: document.getElementById("priority"),
  startTime: document.getElementById("startTime"),
  endTime: document.getElementById("endTime"),
  reminder1: document.getElementById("reminder1"),
  reminder2: document.getElementById("reminder2"),
  location: document.getElementById("location"),
  notes: document.getElementById("notes")
};

init();

/* =========================
   INIT
========================= */
async function init() {
  await registerServiceWorker();

  renderDaysHeader();
  fillCategoryOptions();
  fillReminderOptions();
  resetForm();
  bindEvents();
  renderAll();
  await refreshPushButtonState();
}

/* =========================
   EVENTOS UI
========================= */
function bindEvents() {
  els.searchInput?.addEventListener("input", () => {
    search = els.searchInput.value.trim().toLowerCase();
    renderAll();
  });

  els.categoryFilter?.addEventListener("change", () => {
    categoryFilter = els.categoryFilter.value;
    renderAll();
  });

  els.btnToday?.addEventListener("click", () => {
    const now = new Date();
    selectedDate = formatDateKey(now);
    monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderAll();
  });

  els.btnPrevMonth?.addEventListener("click", () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    renderCalendar();
  });

  els.btnNextMonth?.addEventListener("click", () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  // Push real con Service Worker
  els.btnEnableNotifications?.addEventListener("click", subscribeUserToPush);

  els.btnOpenForm?.addEventListener("click", () => openForm());
  els.btnAddSelectedDate?.addEventListener("click", () => openForm(selectedDate));
  els.btnCloseModal?.addEventListener("click", closeForm);
  els.btnCancel?.addEventListener("click", closeForm);
  els.btnSave?.addEventListener("click", saveEvent);
  els.btnExport?.addEventListener("click", exportData);
  els.btnImport?.addEventListener("click", () => els.fileInput?.click());
  els.fileInput?.addEventListener("change", importData);

  els.modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeForm();
  });
}

/* =========================
   PWA / PUSH
========================= */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service Worker no soportado");
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registrado:", reg.scope);
    return reg;
  } catch (err) {
    console.error("Error registrando Service Worker:", err);
    showToast("No se pudo registrar Service Worker");
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function refreshPushButtonState() {
  try {
    if (!els.btnEnableNotifications) return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      els.btnEnableNotifications.textContent = "🔔 Push no soportado";
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      notificationPermission = "granted";
      els.btnEnableNotifications.textContent = "🔔 Push activado";
    } else {
      notificationPermission = typeof Notification !== "undefined"
        ? Notification.permission
        : "default";

      els.btnEnableNotifications.textContent =
        notificationPermission === "granted"
          ? "🔔 Suscribir push"
          : "🔔 Activar push";
    }
  } catch (err) {
    console.error("Error verificando estado push:", err);
  }
}

async function subscribeUserToPush() {
  if (!window.isSecureContext && location.hostname !== "localhost") {
    showToast("Push requiere HTTPS");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    showToast("Service Worker no soportado");
    return;
  }

  if (!("PushManager" in window)) {
    showToast("Push API no soportada");
    return;
  }

  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === "AQUI_TU_CLAVE_PUBLICA_VAPID") {
    showToast("Falta configurar la VAPID PUBLIC KEY");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      notificationPermission = permission;
      await refreshPushButtonState();
      showToast("No se concedió permiso para notificaciones");
      return;
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await sendSubscriptionToServer(subscription);

    notificationPermission = "granted";
    await refreshPushButtonState();
    showToast("Push activado correctamente");
  } catch (err) {
    console.error("Error al activar push:", err);
    showToast("No se pudo activar push");
  }
}

async function sendSubscriptionToServer(subscription) {
  const response = await fetch("/api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(subscription)
  });

  if (!response.ok) {
    throw new Error("No se pudo guardar la suscripción en el servidor");
  }
}

/* =========================
   BACKEND EVENTOS
========================= */
async function saveEventToServer(eventObj) {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(eventObj)
  });

  if (!response.ok) {
    throw new Error("No se pudo guardar el evento en el backend");
  }
}

async function deleteEventFromServer(id) {
  const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("No se pudo eliminar el evento del backend");
  }
}

/* =========================
   DATOS / UTILIDADES
========================= */
function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveEventsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}

function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00`);
}

function humanDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function humanDateTime(dateStr, timeStr) {
  const d = combineDateTime(dateStr, timeStr);
  if (!d) return "";
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function reminderLabel(mins) {
  mins = Number(mins);
  if (mins === 0) return "A la hora exacta";
  if (mins < 60) return `${mins} min antes`;
  if (mins === 60) return "1 hora antes";
  if (mins < 1440) return `${mins / 60} horas antes`;
  if (mins === 1440) return "1 día antes";
  return `${mins} min antes`;
}

function nextId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getCategoryColor(name) {
  return CATEGORIES.find(c => c.name === name)?.color || "#2563eb";
}

function startOfMonthGrid(curr) {
  const first = new Date(curr.getFullYear(), curr.getMonth(), 1);
  const jsDay = first.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayIndex);
  return gridStart;
}

function filteredEvents() {
  return [...events]
    .filter(ev => categoryFilter === "Todas" || ev.category === categoryFilter)
    .filter(ev => {
      if (!search) return true;
      return [
        ev.title || "",
        ev.location || "",
        ev.notes || "",
        ev.category || "",
        ev.priority || ""
      ].join(" ").toLowerCase().includes(search);
    })
    .sort((a, b) => {
      const aa = combineDateTime(a.date, a.startTime)?.getTime() || 0;
      const bb = combineDateTime(b.date, b.startTime)?.getTime() || 0;
      return aa - bb;
    });
}

function eventsBySelectedDate() {
  return filteredEvents().filter(ev => ev.date === selectedDate);
}

function upcomingEvents() {
  const now = Date.now();
  return filteredEvents()
    .filter(ev => (combineDateTime(ev.date, ev.startTime)?.getTime() || 0) >= now)
    .slice(0, 6);
}

function stats() {
  const now = Date.now();
  const today = formatDateKey(new Date());
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndTs = weekEnd.getTime();

  return {
    total: events.length,
    today: events.filter(e => e.date === today).length,
    week: events.filter(e => {
      const ts = combineDateTime(e.date, e.startTime)?.getTime() || 0;
      return ts >= now && ts <= weekEndTs;
    }).length,
    high: events.filter(e => e.priority === "Alta").length
  };
}

function getMonthMap() {
  const map = new Map();
  events.forEach(ev => {
    map.set(ev.date, (map.get(ev.date) || 0) + 1);
  });
  return map;
}

function showToast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}

/* =========================
   RENDER
========================= */
function renderAll() {
  renderStats();
  renderCalendar();
  renderDayEvents();
  renderUpcoming();
}

function renderDaysHeader() {
  if (!els.daysHead) return;
  els.daysHead.innerHTML = "";
  daysShort.forEach(day => {
    const div = document.createElement("div");
    div.textContent = day;
    els.daysHead.appendChild(div);
  });
}

function fillCategoryOptions() {
  if (els.categoryFilter) {
    els.categoryFilter.innerHTML = `<option value="Todas">Todas</option>`;
  }

  if (els.category) {
    els.category.innerHTML = "";
  }

  CATEGORIES.forEach(c => {
    if (els.categoryFilter) {
      const opt1 = document.createElement("option");
      opt1.value = c.name;
      opt1.textContent = c.name;
      els.categoryFilter.appendChild(opt1);
    }

    if (els.category) {
      const opt2 = document.createElement("option");
      opt2.value = c.name;
      opt2.textContent = c.name;
      if (c.name === DEFAULT_CATEGORY) opt2.selected = true;
      els.category.appendChild(opt2);
    }
  });
}

function fillReminderOptions() {
  [els.reminder1, els.reminder2].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = "";
    REMINDER_OPTIONS.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = reminderLabel(v);
      sel.appendChild(opt);
    });
  });

  if (els.reminder1) els.reminder1.value = "30";
  if (els.reminder2) els.reminder2.value = "0";
}

function resetForm(dateValue = formatDateKey(new Date())) {
  if (els.title) els.title.value = "";
  if (els.date) els.date.value = dateValue;
  if (els.startTime) els.startTime.value = "09:00";
  if (els.endTime) els.endTime.value = "10:00";
  if (els.reminder1) els.reminder1.value = "30";
  if (els.reminder2) els.reminder2.value = "0";
  if (els.category) els.category.value = DEFAULT_CATEGORY;
  if (els.location) els.location.value = "";
  if (els.notes) els.notes.value = "";
  if (els.priority) els.priority.value = "Media";
}

function openForm(preselectedDate = selectedDate) {
  resetForm(preselectedDate || formatDateKey(new Date()));
  if (els.modalBackdrop) {
    els.modalBackdrop.style.display = "flex";
    els.modalBackdrop.classList.add("show");
  }
}

function closeForm() {
  if (els.modalBackdrop) {
    els.modalBackdrop.classList.remove("show");
    els.modalBackdrop.style.display = "none";
  }
}

function saveEvent() {
  const payload = {
    id: nextId(),
    title: els.title?.value.trim() || "",
    date: els.date?.value || "",
    startTime: els.startTime?.value || "",
    endTime: els.endTime?.value || "",
    reminder1: Number(els.reminder1?.value ?? 30),
    reminder2: Number(els.reminder2?.value ?? 0),
    category: els.category?.value || DEFAULT_CATEGORY,
    location: els.location?.value.trim() || "",
    notes: els.notes?.value.trim() || "",
    priority: els.priority?.value || "Media",
    createdAt: new Date().toISOString()
  };

  if (!payload.title) {
    showToast("Escribe el título del evento");
    return;
  }

  if (!payload.date || !payload.startTime) {
    showToast("Define fecha y hora");
    return;
  }

  events.push(payload);
  saveEventsToStorage();

  // ✅ GUARDA EN BACKEND TAMBIÉN
  saveEventToServer(payload).catch(err => {
    console.error("No se pudo guardar en backend:", err);
  });

  selectedDate = payload.date;

  const eventDate = new Date(`${payload.date}T00:00:00`);
  monthCursor = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);

  closeForm();
  renderAll();
  showToast("Evento guardado correctamente");
}

function deleteEvent(id) {
  events = events.filter(ev => ev.id !== id);
  saveEventsToStorage();

  // ✅ ELIMINA DEL BACKEND TAMBIÉN
  deleteEventFromServer(id).catch(err => {
    console.error("No se pudo eliminar del backend:", err);
  });

  renderAll();
  showToast("Evento eliminado");
}

function renderStats() {
  const s = stats();
  if (els.statTotal) els.statTotal.textContent = s.total;
  if (els.statToday) els.statToday.textContent = s.today;
  if (els.statWeek) els.statWeek.textContent = s.week;
  if (els.statHigh) els.statHigh.textContent = s.high;
}

function renderCalendar() {
  if (!els.calendarGrid || !els.monthTitle) return;

  els.monthTitle.textContent = `${monthNames[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`;
  els.calendarGrid.innerHTML = "";

  const monthMap = getMonthMap();
  const start = startOfMonthGrid(monthCursor);

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const key = formatDateKey(d);
    const count = monthMap.get(key) || 0;
    const isCurrent = d.getMonth() === monthCursor.getMonth();
    const isToday = key === formatDateKey(new Date());
    const isSelected = key === selectedDate;

    const btn = document.createElement("button");
    btn.className = [
      "day-btn",
      !isCurrent ? "other-month" : "",
      isSelected ? "selected" : ""
    ].filter(Boolean).join(" ");

    btn.innerHTML = `
      <div class="day-top">
        <span class="day-number">${d.getDate()}</span>
        ${isToday ? `<span class="today-pill">Hoy</span>` : ``}
      </div>
      ${count > 0 ? `<div class="event-count">${count} evento${count !== 1 ? "s" : ""}</div>` : ``}
    `;

    btn.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();
      renderDayEvents();
    });

    els.calendarGrid.appendChild(btn);
  }
}

function renderDayEvents() {
  if (!els.selectedDateTitle || !els.dayEvents) return;

  els.selectedDateTitle.textContent = humanDate(selectedDate);
  const list = eventsBySelectedDate();
  els.dayEvents.innerHTML = "";

  if (list.length === 0) {
    els.dayEvents.innerHTML = `<div class="empty">No hay eventos para esta fecha.</div>`;
    return;
  }

  list.forEach(ev => {
    const div = document.createElement("div");
    div.className = "event-card";

    const reminderText = Number(ev.reminder2) !== Number(ev.reminder1)
      ? `${reminderLabel(ev.reminder1)} · ${reminderLabel(ev.reminder2)}`
      : reminderLabel(ev.reminder1);

    div.innerHTML = `
      <div class="event-top">
        <div style="min-width:0;">
          <div class="chips">
            <span class="chip" style="background:${getCategoryColor(ev.category)}">${escapeHtml(ev.category)}</span>
            <span class="chip chip-outline">${escapeHtml(ev.priority)}</span>
          </div>
          <h4 class="event-title">${escapeHtml(ev.title)}</h4>
        </div>
        <button class="btn btn-danger btn-delete">🗑</button>
      </div>

      <div class="detail-list">
        <div>🕒 ${escapeHtml(ev.startTime)}${ev.endTime ? ` - ${escapeHtml(ev.endTime)}` : ""}</div>
        ${ev.location ? `<div>📍 ${escapeHtml(ev.location)}</div>` : ""}
        <div>🔔 ${escapeHtml(reminderText)}</div>
        ${ev.notes ? `<div>📝 ${escapeHtml(ev.notes)}</div>` : ""}
      </div>
    `;

    div.querySelector(".btn-delete")?.addEventListener("click", () => deleteEvent(ev.id));
    els.dayEvents.appendChild(div);
  });
}

function renderUpcoming() {
  if (!els.upcomingEvents) return;

  const list = upcomingEvents();
  els.upcomingEvents.innerHTML = "";

  if (list.length === 0) {
    els.upcomingEvents.innerHTML = `<div class="empty">No hay próximos eventos.</div>`;
    return;
  }

  list.forEach(ev => {
    const btn = document.createElement("button");
    btn.className = "upcoming-btn";
    btn.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${escapeHtml(ev.title)}
          </div>
          <div style="margin-top:4px; font-size:12px; color:#94a3b8;">
            ${escapeHtml(humanDateTime(ev.date, ev.startTime))}
          </div>
        </div>
        <span class="chip" style="background:${getCategoryColor(ev.category)}">${escapeHtml(ev.category)}</span>
      </div>
    `;

    btn.addEventListener("click", () => {
      selectedDate = ev.date;
      const d = new Date(`${ev.date}T00:00:00`);
      monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
      renderDayEvents();
    });

    els.upcomingEvents.appendChild(btn);
  });
}

/* =========================
   IMPORT / EXPORT
========================= */
function exportData() {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agenda-profesional.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "[]"));
      if (!Array.isArray(parsed)) throw new Error("Formato inválido");

      events = parsed;
      saveEventsToStorage();
      renderAll();
      showToast("Agenda importada correctamente");
    } catch {
      showToast("No se pudo importar el archivo");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

/* =========================
   SEGURIDAD HTML
========================= */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}