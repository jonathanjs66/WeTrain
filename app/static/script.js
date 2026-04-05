const API_BASE = "/api";
const HOURLY_SLOT_LIMIT = 5;
const HOUR_START = 6;
const HOUR_END = 23;

let currentUser = null;
let currentRole = null;
let currentTrainerId = null;

let trainers = [];
let adminSessions = [];
let trainerSessions = [];

let selectedAdminDay = null;
let selectedTrainerDay = null;
let adminMonthDate = startOfMonth(new Date());
let trainerMonthDate = startOfMonth(new Date());
let pendingSlotAction = null;

document.addEventListener("DOMContentLoaded", () => {
    checkHealth();

    document.getElementById("loginButton").addEventListener("click", login);
    document.getElementById("logoutButton").addEventListener("click", logout);
    document.getElementById("loginPassword").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            login();
        }
    });

    bootstrapAuth();
    setInterval(refreshCurrentView, 5000);
});

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getSessionDayKey(isoString) {
    return isoString.slice(0, 10);
}

function formatMonthLabel(date) {
    return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function formatDayLabel(dayKey) {
    return new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
    });
}

function formatSessionTime(isoString) {
    return new Date(isoString).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatHourLabel(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
}

function groupSessionsByDay(sessions) {
    const grouped = {};

    for (const session of sessions) {
        const dayKey = getSessionDayKey(session.starts_at);
        if (!grouped[dayKey]) {
            grouped[dayKey] = [];
        }
        grouped[dayKey].push(session);
    }

    return grouped;
}

function groupSessionsByHour(sessions) {
    const grouped = {};

    for (let hour = HOUR_START; hour <= HOUR_END; hour += 1) {
        grouped[hour] = [];
    }

    for (const session of sessions) {
        const hour = new Date(session.starts_at).getHours();
        if (!grouped[hour]) {
            grouped[hour] = [];
        }
        grouped[hour].push(session);
    }

    return grouped;
}

function getRemainingSlots(bookedCount) {
    return Math.max(0, HOURLY_SLOT_LIMIT - bookedCount);
}

function getSessionsForDay(groupedSessions, dayKey) {
    return groupedSessions[dayKey] || [];
}

function getTrainerName(trainerId) {
    return trainers.find((trainer) => trainer.id === trainerId)?.name || `Trainer ${trainerId}`;
}

function getMonthGridDays(monthDate) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startOffset);

    const days = [];
    for (let index = 0; index < 42; index += 1) {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        days.push(day);
    }

    return days;
}

async function apiFetch(path, options = {}) {
    const response = await fetch(path, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    return { response, data };
}

async function bootstrapAuth() {
    try {
        const { response, data } = await apiFetch(`${API_BASE}/auth/me`);
        if (!response.ok) {
            showLogin();
            return;
        }

        if (data.authenticated) {
            await setAuthenticatedUser(data.user);
            return;
        }

        showLogin();
    } catch (error) {
        showLogin();
    }
}

async function login() {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!username || !password) {
        showLoginMessage("Please enter username and password.", "error");
        return;
    }

    const loginButton = document.getElementById("loginButton");
    loginButton.disabled = true;

    try {
        const { response, data } = await apiFetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            showLoginMessage(data.error || "Login failed.", "error");
            return;
        }

        document.getElementById("loginPassword").value = "";
        showLoginMessage("", "");
        await setAuthenticatedUser(data.user);
    } catch (error) {
        showLoginMessage(`Error: ${error.message}`, "error");
    } finally {
        loginButton.disabled = false;
    }
}

async function logout() {
    try {
        await apiFetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } catch (error) {
        console.error("Failed to log out:", error);
    }

    currentUser = null;
    currentRole = null;
    currentTrainerId = null;
    pendingSlotAction = null;
    showLogin();
}

async function setAuthenticatedUser(user) {
    currentUser = user;
    currentRole = user.role;
    currentTrainerId = user.trainer_id;

    document.getElementById("currentUsername").textContent = user.username;
    document.getElementById("currentUserRole").textContent =
        user.role === "admin" ? "Admin session" : `Trainer session${user.trainer_id ? ` · Trainer ${user.trainer_id}` : ""}`;
    document.getElementById("currentUserBadge").classList.remove("hidden");
    document.getElementById("logoutButton").classList.remove("hidden");

    await showApp();
}

function showLogin() {
    document.getElementById("loginView").classList.remove("hidden");
    document.getElementById("appShell").classList.add("hidden");
    document.getElementById("adminView").classList.remove("visible");
    document.getElementById("trainerView").classList.remove("visible");
    document.getElementById("currentUserBadge").classList.add("hidden");
    document.getElementById("logoutButton").classList.add("hidden");
    document.getElementById("currentUsername").textContent = "Guest";
    document.getElementById("currentUserRole").textContent = "Not signed in";
}

async function showApp() {
    document.getElementById("loginView").classList.add("hidden");
    document.getElementById("appShell").classList.remove("hidden");

    if (currentRole === "admin") {
        document.getElementById("adminView").classList.add("visible");
        document.getElementById("trainerView").classList.remove("visible");
        await loadTrainers();
        await loadSessions();
    } else {
        document.getElementById("adminView").classList.remove("visible");
        document.getElementById("trainerView").classList.add("visible");
        await loadTrainerSessions();
    }

    clearMessages();
}

function clearMessages() {
    for (const id of ["message", "trainerMessage", "loginMessage", "slotModalMessage"]) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = "";
            element.className = "message";
        }
    }
}

async function refreshCurrentView() {
    if (!currentUser) {
        return;
    }

    if (currentRole === "trainer") {
        await loadTrainerSessions();
    } else {
        await loadTrainers();
        await loadSessions();
    }
}

async function checkHealth() {
    try {
        const { data } = await apiFetch("/health");
        const healthElement = document.getElementById("health");

        if (data.status === "ok") {
            healthElement.textContent = "Backend connected";
            healthElement.classList.add("ok");
        }
    } catch (error) {
        document.getElementById("health").textContent = "Connection failed";
    }
}

async function loadTrainers() {
    const { response, data } = await apiFetch(`${API_BASE}/trainers/`);
    if (!response.ok) {
        showMessage(data.error || "Failed to load trainers", "error");
        return;
    }

    trainers = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : [];

    const list = document.getElementById("trainersList");
    list.innerHTML = trainers.length === 0
        ? "<p>No trainers yet</p>"
        : trainers.map((trainer) => `
            <div class="trainer-list-item">
                <strong>${trainer.name}</strong>
                <span>ID ${trainer.id}</span>
            </div>
        `).join("");

    const sessionTrainer = document.getElementById("sessionTrainer");
    const currentSessionTrainer = sessionTrainer.value;
    sessionTrainer.innerHTML = '<option value="">Select Trainer</option>' +
        trainers.map((trainer) => `<option value="${trainer.id}">${trainer.name}</option>`).join("");
    sessionTrainer.value = currentSessionTrainer;
}

async function loadSessions() {
    const { response, data } = await apiFetch(`${API_BASE}/sessions/`);
    if (!response.ok) {
        showMessage(data.error || "Failed to load sessions", "error");
        return;
    }

    adminSessions = Array.isArray(data) ? data : [];
    if (!selectedAdminDay) {
        selectedAdminDay = formatDayKey(new Date());
    }

    renderAdminCalendar();
}

async function loadTrainerSessions() {
    const { response, data } = await apiFetch(`${API_BASE}/sessions/`);
    if (!response.ok) {
        showTrainerMessage(data.error || "Failed to load sessions", "error");
        return;
    }

    trainerSessions = Array.isArray(data) ? data : [];

    if (trainerSessions.length > 0) {
        const firstSession = trainerSessions[0];
        selectedTrainerDay = getSessionDayKey(firstSession.starts_at);
        trainerMonthDate = startOfMonth(new Date(firstSession.starts_at));
    } else if (!selectedTrainerDay) {
        selectedTrainerDay = formatDayKey(new Date());
        trainerMonthDate = startOfMonth(new Date());
    }

    renderTrainerCalendar();
}

function renderMonthCalendar({ gridId, titleId, sessions, selectedDay, monthDate, onSelectDay }) {
    const grid = document.getElementById(gridId);
    const title = document.getElementById(titleId);
    const groupedSessions = groupSessionsByDay(sessions);
    const monthDays = getMonthGridDays(monthDate);
    const todayKey = formatDayKey(new Date());

    title.textContent = formatMonthLabel(monthDate);
    grid.innerHTML = monthDays.map((date) => {
        const dayKey = formatDayKey(date);
        const daySessions = getSessionsForDay(groupedSessions, dayKey);
        const isCurrentMonth = date.getMonth() === monthDate.getMonth();
        const isSelected = dayKey === selectedDay;
        const isToday = dayKey === todayKey;

        return `
            <button
                type="button"
                class="calendar-day ${isCurrentMonth ? "" : "is-outside"} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}"
                data-day-key="${dayKey}"
            >
                <span class="calendar-day__number">${date.getDate()}</span>
                <span class="calendar-day__booked">${daySessions.length} sessions</span>
                <span class="calendar-day__slots">${daySessions.length === 0 ? "Open day" : "View hours"}</span>
            </button>
        `;
    }).join("");

    grid.querySelectorAll(".calendar-day").forEach((button) => {
        button.addEventListener("click", () => onSelectDay(button.dataset.dayKey));
    });
}

function renderAdminHourSchedule() {
    const summary = document.getElementById("adminDaySummary");
    const list = document.getElementById("sessionsList");

    if (!selectedAdminDay) {
        summary.textContent = "Choose a day to inspect hourly capacity.";
        list.innerHTML = "<p>No day selected</p>";
        return;
    }

    const groupedByDay = groupSessionsByDay(adminSessions);
    const daySessions = getSessionsForDay(groupedByDay, selectedAdminDay);
    const groupedByHour = groupSessionsByHour(daySessions);

    summary.textContent = `${formatDayLabel(selectedAdminDay)}. Each hour has 5 slots between 06:00 and 23:00.`;
    list.innerHTML = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => HOUR_START + index).map((hour) => {
        const hourSessions = groupedByHour[hour] || [];
        const remainingSlots = getRemainingSlots(hourSessions.length);

        return `
            <section class="hour-block">
                <div class="hour-block__header">
                    <strong>${formatHourLabel(hour)}</strong>
                    <span>${hourSessions.length}/5 booked</span>
                    <span>${remainingSlots} left</span>
                </div>
                <div class="hour-block__slots">
                    ${hourSessions.length === 0 ? '<p class="empty-note">No bookings in this hour.</p>' : hourSessions.map((session) => `
                        <div class="hour-slot filled">
                            <strong>${session.client_name}</strong>
                            <span>${getTrainerName(session.trainer_id)}</span>
                            <span>${formatSessionTime(session.starts_at)} - ${formatSessionTime(session.ends_at)}</span>
                        </div>
                    `).join("")}
                    ${Array.from({ length: remainingSlots }, () => '<div class="hour-slot open">Open slot</div>').join("")}
                </div>
            </section>
        `;
    }).join("");
}

function renderTrainerDaySessions() {
    const summary = document.getElementById("trainerDaySummary");
    const list = document.getElementById("trainerSessions");

    if (!selectedTrainerDay) {
        summary.textContent = "Choose a day to inspect your bookings.";
        list.innerHTML = "<p>No day selected</p>";
        return;
    }

    const groupedSessions = groupSessionsByDay(trainerSessions);
    const daySessions = getSessionsForDay(groupedSessions, selectedTrainerDay);
    const groupedByHour = groupSessionsByHour(daySessions);

    summary.textContent = `${formatDayLabel(selectedTrainerDay)}. Click an open slot to book, or an existing one to cancel.`;

    list.innerHTML = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => HOUR_START + index).map((hour) => {
        const hourSessions = groupedByHour[hour] || [];
        const remainingSlots = getRemainingSlots(hourSessions.length);

        return `
            <section class="hour-block">
                <div class="hour-block__header">
                    <strong>${formatHourLabel(hour)}</strong>
                    <span>${hourSessions.length}/5 booked</span>
                    <span>${remainingSlots} left</span>
                </div>
                <div class="hour-block__slots">
                    ${hourSessions.map((session) => {
                        const safeClientName = session.client_name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                        return `
                        <button
                            type="button"
                            class="hour-slot filled clickable-slot"
                            onclick="openExistingSessionModal(${session.id}, '${selectedTrainerDay}', ${hour}, '${safeClientName}')"
                        >
                            <strong>${session.client_name}</strong>
                            <span>${formatSessionTime(session.starts_at)} - ${formatSessionTime(session.ends_at)}</span>
                        </button>
                    `;
                    }).join("")}
                    ${Array.from({ length: remainingSlots }, () => `
                        <button
                            type="button"
                            class="hour-slot open clickable-slot"
                            onclick="openSlotModal('${selectedTrainerDay}', ${hour})"
                        >
                            Open slot
                        </button>
                    `).join("")}
                </div>
            </section>
        `;
    }).join("");
}

function renderTrainerMonthList() {
    const summary = document.getElementById("trainerMonthSummary");
    const list = document.getElementById("trainerMonthList");
    const monthSessions = trainerSessions
        .filter((session) => {
            const sessionDate = new Date(session.starts_at);
            return (
                sessionDate.getFullYear() === trainerMonthDate.getFullYear() &&
                sessionDate.getMonth() === trainerMonthDate.getMonth()
            );
        })
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

    summary.textContent = `${formatMonthLabel(trainerMonthDate)} sessions, oldest to newest.`;

    if (monthSessions.length === 0) {
        list.innerHTML = "<p>No sessions this month.</p>";
        return;
    }

    const now = new Date();
    list.innerHTML = monthSessions.map((session) => {
        const isPast = new Date(session.ends_at) < now;

        return `
            <div class="month-session-item ${isPast ? "past" : "upcoming"}">
                <strong>${session.client_name}</strong>
                <span>${formatDayLabel(getSessionDayKey(session.starts_at))}</span>
                <span>${formatSessionTime(session.starts_at)} - ${formatSessionTime(session.ends_at)}</span>
            </div>
        `;
    }).join("");
}

function renderAdminCalendar() {
    renderMonthCalendar({
        gridId: "sessionsCalendar",
        titleId: "adminCalendarTitle",
        sessions: adminSessions,
        selectedDay: selectedAdminDay,
        monthDate: adminMonthDate,
        onSelectDay: (dayKey) => {
            selectedAdminDay = dayKey;
            adminMonthDate = startOfMonth(new Date(`${dayKey}T00:00:00`));
            renderAdminCalendar();
        },
    });

    renderAdminHourSchedule();
}

function renderTrainerCalendar() {
    renderMonthCalendar({
        gridId: "trainerCalendar",
        titleId: "trainerCalendarTitle",
        sessions: trainerSessions,
        selectedDay: selectedTrainerDay,
        monthDate: trainerMonthDate,
        onSelectDay: (dayKey) => {
            selectedTrainerDay = dayKey;
            trainerMonthDate = startOfMonth(new Date(`${dayKey}T00:00:00`));
            renderTrainerCalendar();
        },
    });

    renderTrainerMonthList();
    renderTrainerDaySessions();
}

function changeAdminMonth(offset) {
    adminMonthDate = new Date(adminMonthDate.getFullYear(), adminMonthDate.getMonth() + offset, 1);
    renderAdminCalendar();
}

function changeTrainerMonth(offset) {
    trainerMonthDate = new Date(trainerMonthDate.getFullYear(), trainerMonthDate.getMonth() + offset, 1);
    renderTrainerCalendar();
}

async function addTrainer() {
    const name = document.getElementById("trainerName").value.trim();
    if (!name) {
        showMessage("Please enter a trainer name", "error");
        return;
    }

    const { response, data } = await apiFetch(`${API_BASE}/trainers/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });

    if (!response.ok) {
        showMessage(data.error || "Failed to create trainer", "error");
        return;
    }

    showMessage("Trainer created", "success");
    document.getElementById("trainerName").value = "";
    await loadTrainers();
}

async function addSession() {
    const trainerId = document.getElementById("sessionTrainer").value;
    const clientName = document.getElementById("sessionClient").value.trim();
    const start = document.getElementById("sessionStart").value;
    const end = document.getElementById("sessionEnd").value;

    if (!trainerId || !clientName || !start || !end) {
        showMessage("Please fill in all fields", "error");
        return;
    }

    const { response, data } = await apiFetch(`${API_BASE}/sessions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            trainer_id: parseInt(trainerId, 10),
            client_name: clientName,
            starts_at: new Date(start).toISOString(),
            ends_at: new Date(end).toISOString(),
        }),
    });

    if (!response.ok) {
        showMessage(data.error || "Failed to create session", "error");
        return;
    }

    showMessage("Session created", "success");
    document.getElementById("sessionClient").value = "";
    document.getElementById("sessionStart").value = "";
    document.getElementById("sessionEnd").value = "";
    await loadSessions();
}

function showMessage(text, type) {
    setMessage("message", text, type);
}

function showTrainerMessage(text, type) {
    setMessage("trainerMessage", text, type);
}

function showLoginMessage(text, type) {
    setMessage("loginMessage", text, type);
}

function setMessage(id, text, type) {
    const message = document.getElementById(id);
    if (!message) {
        return;
    }

    message.textContent = text;
    message.className = text ? `message ${type}` : "message";
    if (text) {
        setTimeout(() => {
            if (message.textContent === text) {
                message.className = "message";
            }
        }, 3000);
    }
}

function openSlotModal(dayKey, hour) {
    pendingSlotAction = { mode: "create", dayKey, hour };
    document.getElementById("slotModalTitle").textContent = "Book Slot";
    document.getElementById("slotClientName").value = "";
    document.getElementById("slotClientName").disabled = false;
    document.getElementById("slotModalMessage").className = "message";
    document.getElementById("slotModalMessage").textContent = "";
    document.getElementById("slotModalConfirmButton").textContent = "Make Appointment";
    document.getElementById("slotModalSummary").textContent = `${formatDayLabel(dayKey)} at ${formatHourLabel(hour)}. Enter a client name to create the appointment.`;
    document.getElementById("slotModal").classList.remove("hidden");
}

function openExistingSessionModal(sessionId, dayKey, hour, clientName) {
    pendingSlotAction = { mode: "delete", sessionId };
    document.getElementById("slotModalTitle").textContent = "Cancel Session";
    document.getElementById("slotClientName").value = clientName;
    document.getElementById("slotClientName").disabled = true;
    document.getElementById("slotModalMessage").className = "message";
    document.getElementById("slotModalMessage").textContent = "";
    document.getElementById("slotModalConfirmButton").textContent = "Cancel Session";
    document.getElementById("slotModalSummary").textContent = `${formatDayLabel(dayKey)} at ${formatHourLabel(hour)}. Cancel this appointment or close the popup.`;
    document.getElementById("slotModal").classList.remove("hidden");
}

function closeSlotModal() {
    pendingSlotAction = null;
    document.getElementById("slotModal").classList.add("hidden");
}

async function confirmSlotAction() {
    if (!pendingSlotAction) {
        return;
    }

    if (pendingSlotAction.mode === "delete") {
        await confirmSessionCancellation();
        return;
    }

    const clientName = document.getElementById("slotClientName").value.trim();
    if (!clientName) {
        setMessage("slotModalMessage", "Please enter a client name.", "error");
        return;
    }

    const startsAt = new Date(`${pendingSlotAction.dayKey}T00:00:00`);
    startsAt.setHours(pendingSlotAction.hour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 1);

    const { response, data } = await apiFetch(`${API_BASE}/sessions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            trainer_id: currentTrainerId,
            client_name: clientName,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
        }),
    });

    if (!response.ok) {
        setMessage("slotModalMessage", data.error || "Failed to create session.", "error");
        return;
    }

    closeSlotModal();
    showTrainerMessage("Session booked", "success");
    await loadTrainerSessions();
}

async function confirmSessionCancellation() {
    const { response, data } = await apiFetch(`${API_BASE}/sessions/${pendingSlotAction.sessionId}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        setMessage("slotModalMessage", data.error || "Failed to cancel session.", "error");
        return;
    }

    closeSlotModal();
    showTrainerMessage("Session cancelled", "success");
    await loadTrainerSessions();
}

window.changeAdminMonth = changeAdminMonth;
window.changeTrainerMonth = changeTrainerMonth;
window.addTrainer = addTrainer;
window.addSession = addSession;
window.openSlotModal = openSlotModal;
window.openExistingSessionModal = openExistingSessionModal;
window.closeSlotModal = closeSlotModal;
window.confirmSlotAction = confirmSlotAction;
