const API_BASE = "/api";
const DAILY_SLOT_LIMIT = 5;
const HOUR_START = 6;
const HOUR_END = 23;

let currentRole = "admin";
let currentTrainerId = 1;
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
    loadTrainers();
    loadSessions();
    setInterval(refreshCurrentView, 5000);

    document.querySelectorAll('input[name="role"]').forEach((radio) => {
        radio.addEventListener("change", (event) => {
            currentRole = event.target.value;
            switchRole();
        });
    });

    document.getElementById("trainerSelect").addEventListener("change", (event) => {
        currentTrainerId = parseInt(event.target.value, 10);
        loadTrainerSessions();
    });
});

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getAuthHeaders(role = currentRole, trainerId = currentTrainerId) {
    const headers = {};

    if (role === "admin") {
        headers["X-Role"] = "admin";
    } else if (role === "trainer") {
        headers["X-Role"] = "trainer";
        headers["X-Trainer-Id"] = String(trainerId);
    }

    return headers;
}

function switchRole() {
    document.getElementById("adminView").classList.toggle("visible", currentRole === "admin");
    document.getElementById("trainerView").classList.toggle("visible", currentRole === "trainer");

    if (currentRole === "trainer") {
        loadTrainerSessions();
    } else {
        loadSessions();
    }
}

function refreshCurrentView() {
    if (currentRole === "trainer") {
        loadTrainerSessions();
    } else {
        loadTrainers();
        loadSessions();
    }
}

async function checkHealth() {
    try {
        const response = await fetch("/health");
        const data = await response.json();
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
    try {
        const response = await fetch(`${API_BASE}/trainers/`, {
            headers: getAuthHeaders("admin"),
        });
        const trainerData = await response.json();

        trainers = Array.isArray(trainerData)
            ? [...trainerData].sort((a, b) => a.name.localeCompare(b.name))
            : [];

        const list = document.getElementById("trainersList");
        if (trainers.length === 0) {
            list.innerHTML = "<p>No trainers yet</p>";
        } else {
            list.innerHTML = trainers.map((trainer) => `
                <div class="trainer-list-item">
                    <strong>${trainer.name}</strong>
                    <span>ID ${trainer.id}</span>
                </div>
            `).join("");
        }

        const sessionTrainer = document.getElementById("sessionTrainer");
        const currentSessionTrainer = sessionTrainer.value;
        sessionTrainer.innerHTML = '<option value="">Select Trainer</option>' +
            trainers.map((trainer) => `<option value="${trainer.id}">${trainer.name}</option>`).join("");
        sessionTrainer.value = currentSessionTrainer;

        const trainerSelect = document.getElementById("trainerSelect");
        trainerSelect.innerHTML = trainers.map((trainer) => `<option value="${trainer.id}">${trainer.name}</option>`).join("");

        if (!trainers.some((trainer) => trainer.id === currentTrainerId)) {
            currentTrainerId = trainers[0]?.id || 1;
        }

        trainerSelect.value = String(currentTrainerId);
    } catch (error) {
        console.error("Failed to load trainers:", error);
    }
}

async function loadSessions() {
    try {
        const response = await fetch(`${API_BASE}/sessions/`, {
            headers: getAuthHeaders("admin"),
        });
        adminSessions = await response.json();

        if (!selectedAdminDay) {
            selectedAdminDay = formatDayKey(new Date());
        }

        renderAdminCalendar();
    } catch (error) {
        console.error("Failed to load sessions:", error);
    }
}

async function loadTrainerSessions() {
    try {
        const response = await fetch(`${API_BASE}/sessions/`, {
            headers: getAuthHeaders("trainer", currentTrainerId),
        });
        trainerSessions = await response.json();

        if (!selectedTrainerDay) {
            selectedTrainerDay = formatDayKey(new Date());
        }

        renderTrainerCalendar();
    } catch (error) {
        console.error("Failed to load trainer sessions:", error);
    }
}

function getSessionDayKey(isoString) {
    return isoString.slice(0, 10);
}

function formatDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    return Math.max(0, DAILY_SLOT_LIMIT - bookedCount);
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
        button.addEventListener("click", () => {
            onSelectDay(button.dataset.dayKey);
        });
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

    summary.textContent = `${formatDayLabel(selectedTrainerDay)}. Click an open slot to book an appointment.`;

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
                    ${hourSessions.map((session) => `
                        <button
                            type="button"
                            class="hour-slot filled clickable-slot"
                            onclick="openExistingSessionModal(${session.id}, '${selectedTrainerDay}', ${hour}, '${session.client_name.replace(/'/g, "\\'")}')"
                        >
                            <strong>${session.client_name}</strong>
                            <span>${formatSessionTime(session.starts_at)} - ${formatSessionTime(session.ends_at)}</span>
                        </button>
                    `).join("")}
                    ${Array.from({ length: remainingSlots }, (_, slotIndex) => `
                        <button
                            type="button"
                            class="hour-slot open clickable-slot"
                            onclick="openSlotModal('${selectedTrainerDay}', ${hour}, ${slotIndex})"
                        >
                            Open slot
                        </button>
                    `).join("")}
                    ${hourSessions.length === 0 && remainingSlots === 0 ? '<p class="empty-note">No bookings in this hour.</p>' : ""}
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

    try {
        const response = await fetch(`${API_BASE}/trainers/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders("admin"),
            },
            body: JSON.stringify({ name }),
        });

        const data = await response.json();
        if (!response.ok) {
            showMessage(data.error || "Failed to create trainer", "error");
            return;
        }

        showMessage("Trainer created", "success");
        document.getElementById("trainerName").value = "";
        await loadTrainers();
    } catch (error) {
        showMessage(`Error: ${error.message}`, "error");
    }
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

    try {
        const response = await fetch(`${API_BASE}/sessions/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders("admin"),
            },
            body: JSON.stringify({
                trainer_id: parseInt(trainerId, 10),
                client_name: clientName,
                starts_at: new Date(start).toISOString(),
                ends_at: new Date(end).toISOString(),
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            showMessage(data.error || "Failed to create session", "error");
            return;
        }

        showMessage("Session created", "success");
        document.getElementById("sessionClient").value = "";
        document.getElementById("sessionStart").value = "";
        document.getElementById("sessionEnd").value = "";
        await loadSessions();
    } catch (error) {
        showMessage(`Error: ${error.message}`, "error");
    }
}

async function bookSession() {
    const clientName = document.getElementById("bookClientName").value.trim();
    const start = document.getElementById("bookStart").value;
    const end = document.getElementById("bookEnd").value;

    if (!clientName || !start || !end) {
        showBookMessage("Please fill in all fields", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/sessions/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders("trainer", currentTrainerId),
            },
            body: JSON.stringify({
                trainer_id: currentTrainerId,
                client_name: clientName,
                starts_at: new Date(start).toISOString(),
                ends_at: new Date(end).toISOString(),
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            showBookMessage(data.error || "Failed to book session", "error");
            return;
        }

        showBookMessage("Session booked", "success");
        document.getElementById("bookClientName").value = "";
        document.getElementById("bookStart").value = "";
        document.getElementById("bookEnd").value = "";
        await loadTrainerSessions();
    } catch (error) {
        showBookMessage(`Error: ${error.message}`, "error");
    }
}

function showMessage(text, type) {
    const message = document.getElementById("message");
    message.textContent = text;
    message.className = `message ${type}`;
    setTimeout(() => {
        message.className = "message";
    }, 3000);
}

function showBookMessage(text, type) {
    const message = document.getElementById("bookMessage");
    message.textContent = text;
    message.className = `message ${type}`;
    setTimeout(() => {
        message.className = "message";
    }, 3000);
}

function openSlotModal(dayKey, hour) {
    pendingSlotAction = { mode: "create", dayKey, hour };
    document.getElementById("slotModalTitle").textContent = "Book Slot";
    document.getElementById("slotClientName").value = "";
    document.getElementById("slotClientName").disabled = false;
    document.getElementById("slotModalMessage").className = "message";
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
        const modalMessage = document.getElementById("slotModalMessage");
        modalMessage.textContent = "Please enter a client name.";
        modalMessage.className = "message error";
        return;
    }

    const startsAt = new Date(`${pendingSlotAction.dayKey}T00:00:00`);
    startsAt.setHours(pendingSlotAction.hour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 1);

    try {
        const response = await fetch(`${API_BASE}/sessions/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders("trainer", currentTrainerId),
            },
            body: JSON.stringify({
                trainer_id: currentTrainerId,
                client_name: clientName,
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            const modalMessage = document.getElementById("slotModalMessage");
            modalMessage.textContent = data.error || "Failed to create session.";
            modalMessage.className = "message error";
            return;
        }

        closeSlotModal();
        showBookMessage("Session booked", "success");
        await loadTrainerSessions();
    } catch (error) {
        const modalMessage = document.getElementById("slotModalMessage");
        modalMessage.textContent = `Error: ${error.message}`;
        modalMessage.className = "message error";
    }
}

async function confirmSessionCancellation() {
    try {
        const response = await fetch(`${API_BASE}/sessions/${pendingSlotAction.sessionId}`, {
            method: "DELETE",
            headers: getAuthHeaders("trainer", currentTrainerId),
        });

        const data = await response.json();
        if (!response.ok) {
            const modalMessage = document.getElementById("slotModalMessage");
            modalMessage.textContent = data.error || "Failed to cancel session.";
            modalMessage.className = "message error";
            return;
        }

        closeSlotModal();
        showBookMessage("Session cancelled", "success");
        await loadTrainerSessions();
    } catch (error) {
        const modalMessage = document.getElementById("slotModalMessage");
        modalMessage.textContent = `Error: ${error.message}`;
        modalMessage.className = "message error";
    }
}
