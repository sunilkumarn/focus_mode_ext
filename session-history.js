const HISTORY_KEY = "history_of_work_Sessions";

document.addEventListener("DOMContentLoaded", () => {
    const sessionList = document.getElementById("session-list");
    const emptyState = document.getElementById("empty-state");
    const historyMeta = document.getElementById("history-meta");
    const openPopupLink = document.getElementById("open-popup");

    if (!sessionList) {
        return;
    }

    if (openPopupLink) {
        openPopupLink.addEventListener("click", (event) => {
            event.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
        });
    }

    chrome.storage.local.get([HISTORY_KEY], (data) => {
        const sessions = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
        const sorted = sessions
            .map((session) => ({
                ...session,
                startTime: session.startTime || session.createdAt || 0,
            }))
            .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

        if (sorted.length === 0) {
            if (historyMeta) {
                historyMeta.textContent =
                    "No sessions have been recorded yet. Sessions from the last 7 days will show here.";
            }
            if (emptyState) {
                emptyState.hidden = false;
            }
            return;
        }

        if (historyMeta) {
            const label = sorted.length === 1 ? "session" : "sessions";
            historyMeta.textContent = `Showing ${sorted.length} ${label} from the last 7 days.`;
        }

        sorted.forEach((session) => {
            const card = buildSessionCard(session);
            sessionList.appendChild(card);
        });
    });
});

function buildSessionCard(session) {
    const card = document.createElement("div");
    card.className = "card session-card";

    const now = Date.now();
    const start = session.startTime || session.createdAt || 0;
    const computedEnd =
        session.endTime ||
        session.actualEndTime ||
        start + (Number(session.durationMinutes) || 0) * 60 * 1000;
    const end = computedEnd;
    const durationMinutes =
        Number(session.actualDurationMinutes) ||
        Math.max(1, Math.round((end - start) / 60000));

    const isOngoing = end > now;
    const statusText = isOngoing ? "Ongoing" : "Completed";
    const statusClass = isOngoing ? "status-ongoing" : "status-completed";

    const header = document.createElement("div");
    header.className = "session-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("p");
    title.className = "session-title";
    title.textContent = formatDateRange(start, end);

    const subtitle = document.createElement("p");
    subtitle.className = "session-subtitle";
    subtitle.textContent = `${formatDuration(durationMinutes)} • ${statusText}`;

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const status = document.createElement("span");
    status.className = `status-pill ${statusClass}`;
    status.textContent = statusText;

    header.appendChild(titleWrap);
    header.appendChild(status);

    const intent = document.createElement("p");
    intent.className = "intent";
    if (session.intent && session.intent.trim()) {
        intent.textContent = session.intent.trim();
    } else {
        intent.textContent = "No intent recorded for this session.";
        intent.classList.add("empty");
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const eye = buildBadge("Eye break", session.eyeBreakEnabled !== false);
    const water = buildBadge(
        "Water",
        !!session.waterReminderEnabled,
        session.waterReminderEnabled && session.waterReminderInterval
            ? `${session.waterReminderInterval} min`
            : ""
    );
    const movement = buildBadge(
        "Movement",
        !!session.movementReminderEnabled,
        session.movementReminderEnabled && session.movementReminderInterval
            ? `${session.movementReminderInterval} min`
            : ""
    );

    meta.appendChild(eye);
    meta.appendChild(water);
    meta.appendChild(movement);

    card.appendChild(header);
    card.appendChild(intent);
    card.appendChild(meta);

    return card;
}

function buildBadge(label, isOn, detail = "") {
    const badge = document.createElement("span");
    badge.className = "badge";
    if (!isOn) {
        badge.classList.add("off");
    }

    const dot = document.createElement("span");
    dot.className = "dot";
    badge.appendChild(dot);

    const text = document.createElement("span");
    text.textContent = detail ? `${label}: ${detail}` : `${label}: ${isOn ? "On" : "Off"}`;
    badge.appendChild(text);

    return badge;
}

function formatDateRange(start, end) {
    if (!start) return "Session time unavailable";

    const startDate = new Date(start);
    const endDate = new Date(end || start);

    const datePart = startDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });

    const startTime = startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const endTime = endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return `${datePart} • ${startTime} — ${endTime}`;
}

function formatDuration(minutes) {
    const mins = Math.max(1, Math.round(minutes || 0));
    const hours = Math.floor(mins / 60);
    const remainingMinutes = mins % 60;

    if (hours > 0 && remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    return `${mins}m`;
}

