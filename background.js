let isBlocking = false;
let blockList = []; // Default blocklist
let focusReminderMinutes = 0; // Default reminder when focus mode is OFF (0 = None)
let lockUntil = null; // Timestamp in ms
let currentSession = null; // Stores active session details
const HISTORY_KEY = "history_of_work_Sessions";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Load saved state from storage.local
chrome.storage.local.get(
  [
    "isBlocking",
    "blockList",
    "focusReminderMinutes",
    "lockUntil",
    "currentSession",
    HISTORY_KEY,
  ],
  (data) => {
    if (typeof data.isBlocking === "boolean") isBlocking = data.isBlocking;
    if (Array.isArray(data.blockList)) blockList = data.blockList;
    if (typeof data.focusReminderMinutes === "number") {
      focusReminderMinutes = data.focusReminderMinutes;
    } else if (typeof data.focusReminderMinutes === "string") {
      const parsed = parseInt(data.focusReminderMinutes, 10);
      focusReminderMinutes = !isNaN(parsed) && parsed >= 0 ? parsed : 0;
    }
    if (typeof data.lockUntil === "number") {
      lockUntil = data.lockUntil;
    }
    if (data.currentSession) {
      currentSession = data.currentSession;
      // If a session is still active, reschedule its alarms
      if (currentSession.isActive && currentSession.endTime > Date.now()) {
        scheduleSessionAlarms(currentSession);
      } else if (currentSession.isActive && currentSession.endTime <= Date.now()) {
        // Session has expired while the extension was not running
        currentSession.isActive = false;
        chrome.storage.local.set({ currentSession });
      }
    }

    // Prune stale session history (older than one week)
    if (Array.isArray(data[HISTORY_KEY])) {
      const pruned = pruneSessionHistory(data[HISTORY_KEY]);
      if (pruned.length !== data[HISTORY_KEY].length) {
        chrome.storage.local.set({ [HISTORY_KEY]: pruned });
      }
    }

    updateIcon();
    manageBlocking();
    resetFocusReminderAlarm();
  }
);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setBlockingState") {
    // Explicitly set Focus Mode ON/OFF
    isBlocking = !!message.isBlocking;
    chrome.storage.local.set({ isBlocking }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving blocking state:", chrome.runtime.lastError);
        sendResponse({ success: false });
      } else {
        updateIcon();
        manageBlocking();
        resetFocusReminderAlarm();
        sendResponse({ success: true });
      }
    });
  } else if (message.action === "toggleBlocking") {
    // Backwards-compatible toggle
    isBlocking = !isBlocking;
    chrome.storage.local.set({ isBlocking }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving blocking state:", chrome.runtime.lastError);
        sendResponse({ success: false });
      } else {
        updateIcon();
        manageBlocking();
        resetFocusReminderAlarm();
        sendResponse({ success: true });
      }
    });
  } else if (message.action === "updateBlockList") {
    blockList = message.blockList || [];
    chrome.storage.local.set({ blockList }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving blocklist:", chrome.runtime.lastError);
        sendResponse({ success: false }); // Respond with failure
      } else {
        manageBlocking();
        sendResponse({ success: true }); // Respond back to the sender
      }
    });
  } else if (message.action === "updateFocusReminderMinutes") {
    const parsedMinutes = parseInt(message.minutes, 10);
    focusReminderMinutes = !isNaN(parsedMinutes) && parsedMinutes >= 0 ? parsedMinutes : 0;
    chrome.storage.local.set({ focusReminderMinutes }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving focus reminder minutes:", chrome.runtime.lastError);
        sendResponse({ success: false });
      } else {
        resetFocusReminderAlarm();
        sendResponse({ success: true });
      }
    });
  } else if (message.action === "startWorkSession") {
    startWorkSession(message.config || {}, sendResponse);
  } else if (message.action === "endWorkSession") {
    endWorkSession(sendResponse);
  }

  return true; // Keeps the message port open for asynchronous response
});

// Update the extension icon
function updateIcon() {
  const iconPath = isBlocking ? "icons/icon_on" : "icons/icon_off";
  console.log(`iconPath: ${iconPath}`) ; 
  chrome.action.setIcon({
    path: {
      16: `${iconPath}_16.png`,
      48: `${iconPath}_48.png`,
      128: `${iconPath}_128.png`,
    },
  });
}

function getRootDomain(url) {
    const parts = url.split(".");
    if (parts.length > 2) {
        return parts.slice(-2).join("."); // Extracts root domain (e.g., google.com)
    }
    return url; // Already a root domain
}

// Manage website blocking
function manageBlocking() {
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
        const existingRuleIds = existingRules.map(rule => rule.id); // Get all current rule IDs
        
        const rules = [];
        const uniqueDomains = new Set();

        blockList.forEach((site, index) => {
            const rootDomain = getRootDomain(site);
            if (uniqueDomains.has(rootDomain)) return; // Avoid duplicate rules
            uniqueDomains.add(rootDomain);

            const rootDomainId = index * 2 + 1;
            const subDomainId = index * 2 + 2;

            rules.push(
                {
                    id: rootDomainId, // Unique ID for root domain
                    priority: 1,
                    action: { 
                        type: "redirect",
                        redirect: { extensionPath: "/blocker.html" } // Redirect to local page
                    },
                    condition: {
                        urlFilter: `*://${rootDomain}/*`, // Blocks root domain
                        resourceTypes: ["main_frame"],
                    },
                },
                {
                    id: subDomainId, // Unique ID for subdomains
                    priority: 1,
                    action: { 
                        type: "redirect",
                        redirect: { extensionPath: "/blocker.html" } // Redirect to local page
                    },
                    condition: {
                        urlFilter: `*://*.${rootDomain}/*`, // Blocks all subdomains
                        resourceTypes: ["main_frame"],
                    },
                }
            );
        });

        if (isBlocking) {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingRuleIds, // Remove only the exact IDs used
                addRules: rules, // Add new blocking rules
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error updating blocking rules:", chrome.runtime.lastError);
                }
            });

        } else {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingRuleIds,
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error removing blocking rules:", chrome.runtime.lastError);
                }
            });
        }
    });
}

// Reset the Focus Mode OFF reminder timer
function resetFocusReminderAlarm() {
  chrome.alarms.clear("focusModeReminder", () => {
    if (!isBlocking && typeof focusReminderMinutes === "number" && focusReminderMinutes > 0) {
      chrome.alarms.create("focusModeReminder", {
        delayInMinutes: focusReminderMinutes,
      });
    }
  });
}

// Create or clear alarms for an active work session
function scheduleSessionAlarms(session) {
  clearSessionAlarms(() => {
    if (!session || !session.isActive) return;

    const remainingMinutes = Math.max(
      1,
      Math.round((session.endTime - Date.now()) / 60000)
    );

    chrome.alarms.create("sessionEnd", { delayInMinutes: remainingMinutes });

    if (session.eyeBreakEnabled) {
      chrome.alarms.create("eyeBreakReminder", { periodInMinutes: 20 });
    }

    if (
      session.waterReminderEnabled &&
      session.waterReminderInterval &&
      session.waterReminderInterval <= session.durationMinutes
    ) {
      chrome.alarms.create("waterReminder", {
        periodInMinutes: session.waterReminderInterval,
      });
    }

    if (
      session.movementReminderEnabled &&
      session.movementReminderInterval &&
      session.movementReminderInterval <= session.durationMinutes
    ) {
      chrome.alarms.create("movementReminder", {
        periodInMinutes: session.movementReminderInterval,
      });
    }
  });
}

function clearSessionAlarms(callback) {
  chrome.alarms.clear("sessionEnd", () => {
    chrome.alarms.clear("eyeBreakReminder", () => {
      chrome.alarms.clear("waterReminder", () => {
        chrome.alarms.clear("movementReminder", () => {
          if (typeof callback === "function") {
            callback();
          }
        });
      });
    });
  });
}

function pruneSessionHistory(history) {
  const cutoff = Date.now() - ONE_WEEK_MS;
  return history.filter(
    (entry) => entry && typeof entry.startTime === "number" && entry.startTime >= cutoff
  );
}

function makeSessionHistoryEntry(session, reason = "completed") {
  const actualEndTime = session.actualEndTime || session.endTime || Date.now();
  return {
    id: `session_${session.startTime}_${Math.random().toString(36).slice(2, 8)}`,
    startTime: session.startTime,
    endTime: actualEndTime,
    completedReason: reason,
    actualDurationMinutes: Math.max(
      1,
      Math.round((actualEndTime - session.startTime) / 60000)
    ),
    durationMinutes: session.durationMinutes,
    intent: session.intent || "",
    eyeBreakEnabled: !!session.eyeBreakEnabled,
    waterReminderEnabled: !!session.waterReminderEnabled,
    waterReminderInterval: session.waterReminderInterval,
    movementReminderEnabled: !!session.movementReminderEnabled,
    movementReminderInterval: session.movementReminderInterval,
    createdAt: Date.now(),
  };
}

function startWorkSession(config, sendResponse) {
  const now = Date.now();
  const durationMinutes = Number(config.durationMinutes) || 60;
  const endTime = now + durationMinutes * 60 * 1000;

  currentSession = {
    isActive: true,
    startTime: now,
    endTime,
    durationMinutes,
    intent: config.intent || "",
    eyeBreakEnabled: config.eyeBreakEnabled !== false, // default true
    waterReminderEnabled: !!config.waterReminderEnabled,
    waterReminderInterval: Number(config.waterReminderInterval) || 60,
    movementReminderEnabled: !!config.movementReminderEnabled,
    movementReminderInterval: Number(config.movementReminderInterval) || 60,
    historyRecorded: false,
    actualEndTime: null,
  };

  const sessionDefaultsToPersist = {
    durationMinutes,
    eyeBreakEnabled: currentSession.eyeBreakEnabled,
    waterReminderEnabled: currentSession.waterReminderEnabled,
    waterReminderInterval: currentSession.waterReminderInterval,
    movementReminderEnabled: currentSession.movementReminderEnabled,
    movementReminderInterval: currentSession.movementReminderInterval,
  };

  chrome.storage.local.set(
    {
      currentSession,
      sessionDefaults: sessionDefaultsToPersist,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving session:", chrome.runtime.lastError);
        sendResponse({ success: false });
        return;
      }

      scheduleSessionAlarms(currentSession);

      // Ensure Focus Mode is ON when a session starts
      isBlocking = true;
      chrome.storage.local.set({ isBlocking }, () => {
        updateIcon();
        manageBlocking();
        resetFocusReminderAlarm(); // Focus reminder only applies when OFF
        sendResponse({ success: true });
      });
    }
  );
}

function recordSessionHistory(session, reason, callback) {
  chrome.storage.local.get([HISTORY_KEY], (data) => {
    const history = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
    const prunedHistory = pruneSessionHistory(history);
    prunedHistory.unshift(makeSessionHistoryEntry(session, reason));

    chrome.storage.local.set({ [HISTORY_KEY]: prunedHistory }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving session history:", chrome.runtime.lastError);
      }
      if (typeof callback === "function") callback();
    });
  });
}

function completeCurrentSession(reason, callback) {
  chrome.storage.local.get(["currentSession"], (data) => {
    const session = data.currentSession;
    if (!session || !session.isActive) {
      if (typeof callback === "function") callback({ success: true, message: "No active session" });
      return;
    }

    if (session.historyRecorded) {
      session.isActive = false;
      chrome.storage.local.set({ currentSession: session }, () => {
        if (typeof callback === "function") callback({ success: true });
      });
      return;
    }

    session.isActive = false;
    session.actualEndTime = Date.now();
    session.historyRecorded = true;

    clearSessionAlarms(() => {
      recordSessionHistory(session, reason, () => {
        chrome.storage.local.set({ currentSession: session }, () => {
          if (typeof callback === "function") callback({ success: true });
        });
      });
    });
  });
}

function endWorkSession(sendResponse) {
  completeCurrentSession("manual_end", (result) => {
    if (typeof sendResponse === "function") {
      sendResponse(result);
    }
  });
}

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focusModeReminder") {
    chrome.storage.local.get("isBlocking", (data) => {
      if (!data.isBlocking) {
        chrome.tabs.create({ url: chrome.runtime.getURL("distraction.html") });
      }
    });
  } else if (alarm.name === "sessionEnd") {
    chrome.storage.local.get("currentSession", (data) => {
      const session = data.currentSession;
      if (!session || !session.isActive) return;

      if (session.endTime <= Date.now()) {
        completeCurrentSession("auto_end");
      }
    });
  } else if (alarm.name === "eyeBreakReminder") {
    chrome.storage.local.get("currentSession", (data) => {
      const session = data.currentSession;
      if (!session || !session.isActive || session.endTime <= Date.now()) return;

      if (session.eyeBreakEnabled) {
        chrome.notifications.create("eyeBreakReminderNotification", {
          type: "basic",
          iconUrl: "icons/icon_on_128.png",
          title: "20-20-20 eye break",
          message: "Look 20 feet away for 20 seconds.",
          priority: 0,
        });
      }
    });
  } else if (alarm.name === "waterReminder") {
    chrome.storage.local.get("currentSession", (data) => {
      const session = data.currentSession;
      if (!session || !session.isActive || session.endTime <= Date.now()) return;

      if (
        session.waterReminderEnabled &&
        session.waterReminderInterval <= session.durationMinutes
      ) {
        chrome.notifications.create("waterReminderNotification", {
          type: "basic",
          iconUrl: "icons/icon_on_128.png",
          title: "Water reminder",
          message: "Time to drink some water.",
          priority: 0,
        });
      }
    });
  } else if (alarm.name === "movementReminder") {
    chrome.storage.local.get("currentSession", (data) => {
      const session = data.currentSession;
      if (!session || !session.isActive || session.endTime <= Date.now()) return;

      if (
        session.movementReminderEnabled &&
        session.movementReminderInterval <= session.durationMinutes
      ) {
        chrome.notifications.create("movementReminderNotification", {
          type: "basic",
          iconUrl: "icons/icon_on_128.png",
          title: "Movement break",
          message: "Time for a short movement or squat break.",
          priority: 0,
        });
      }
    });
  }
});
