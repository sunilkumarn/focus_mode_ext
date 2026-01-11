
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggle-btn");
    const websitesContainer = document.getElementById("websites-container");
    const addSiteBtn = document.getElementById("add-website-btn");
    const blockThisBtn = document.getElementById("block-this-btn");
    const reminderTime = document.getElementById("reminder-time");
    const reminderSection = document.getElementById("reminder-settings");
    const toggleStatus = document.getElementById("toggle-status");
    const blockFeedback = document.getElementById("block-feedback");
    const lockDurationSelect = document.getElementById("lock-duration");
    const lockActivateBtn = document.getElementById("lock-activate-btn");

    const sessionDuration45 = document.getElementById("session-duration-45");
    const sessionDuration60 = document.getElementById("session-duration-60");
    const sessionDuration90 = document.getElementById("session-duration-90");
    const sessionDuration120 = document.getElementById("session-duration-120");
    const sessionIntentInput = document.getElementById("session-intent");
    const startSessionBtn = document.getElementById("start-session-btn");

    const eyeBreakToggle = document.getElementById("eye-break-toggle");
    const waterReminderToggle = document.getElementById("water-reminder-toggle");
    const waterIntervalSelect = document.getElementById("water-interval");
    const movementReminderToggle = document.getElementById("movement-reminder-toggle");
    const movementIntervalSelect = document.getElementById("movement-interval");

    let clientId = '' ;
    let blockFeedbackTimeout;
    let isLocked = false;
    let lockUntil = null;
    let sessionDefaults = {
        durationMinutes: 60,
        eyeBreakEnabled: true,
        waterReminderEnabled: false,
        waterReminderInterval: 60,
        movementReminderEnabled: false,
        movementReminderInterval: 60,
    };
    let selectedSessionDuration = sessionDefaults.durationMinutes;

    function getRootDomain(url) {
        const parts = url.split(".");
        if (parts.length > 2) {
            return parts.slice(-2).join("."); // Extracts root domain (e.g., google.com)
        }
        return url; // Already a root domain
    }
    
    function updateReminderVisibility () {
        if(!toggleBtn.checked) {
            reminderSection.style.display = "block";    
        } else {
            reminderSection.style.display = "none";
        }
    }

    function updateToggleStatus () {
        if (!toggleStatus) return;
        toggleStatus.textContent = toggleBtn.checked
            ? "Distractions are blocked"
            : "Distractions are allowed";
    }

    function applyLockStateToUI() {
        isLocked = !!(lockUntil && lockUntil > Date.now());

        const deleteButtons = websitesContainer
            ? Array.from(websitesContainer.querySelectorAll(".delete-btn"))
            : [];

        deleteButtons.forEach((btn) => {
            btn.disabled = isLocked;
        });

        if (lockDurationSelect && isLocked) {
            lockDurationSelect.disabled = true;
        } else if (lockDurationSelect) {
            lockDurationSelect.disabled = false;
        }
    }

    function handleLockActivation() {
        if (!lockDurationSelect) return;
        const days = parseInt(lockDurationSelect.value, 10);
        if (!days || isNaN(days)) return;

        lockUntil = Date.now() + days * 24 * 60 * 60 * 1000;

        chrome.storage.local.set({ lockUntil }, () => {
            applyLockStateToUI();
        });
    }

    function setSelectedSessionDuration(minutes) {
        selectedSessionDuration = minutes;

        if (sessionDuration45) {
            sessionDuration45.classList.toggle("selected", minutes === 45);
        }
        if (sessionDuration60) {
            sessionDuration60.classList.toggle("selected", minutes === 60);
        }
        if (sessionDuration90) {
            sessionDuration90.classList.toggle("selected", minutes === 90);
        }
        if (sessionDuration120) {
            sessionDuration120.classList.toggle("selected", minutes === 120);
        }
    }

    // Initialize popup state
    chrome.storage.local.get(
        [
            "isBlocking",
            "blockList",
            "focusReminderMinutes",
            "clientId",
            "lockUntil",
            "sessionDefaults",
            "currentSession",
        ],
        (data) => {
        toggleBtn.checked = data.isBlocking || false;
        updateReminderVisibility() ; 
        updateToggleStatus();

        if (data.clientId) {
            clientId = data.clientId
        } else {
            clientId = self.crypto.randomUUID();
            chrome.storage.local.set({clientId});
        }

        // Add saved websites
        const savedBlockList = data.blockList || [];
        savedBlockList.forEach(site => addBlockListRow(site));

        // Set saved reminder time (default 10 minutes)
        const savedReminderMinutes =
            typeof data.focusReminderMinutes === "number"
                ? data.focusReminderMinutes
                : 10;
        if (reminderTime) {
            reminderTime.value = savedReminderMinutes.toString();
        }

        // Load lock state
        if (typeof data.lockUntil === "number") {
            lockUntil = data.lockUntil;
            applyLockStateToUI();
        }

        // Load session defaults and/or current session
        if (data.sessionDefaults) {
            sessionDefaults = {
                ...sessionDefaults,
                ...data.sessionDefaults,
            };
        }

        const activeSession =
            data.currentSession && data.currentSession.isActive
                ? data.currentSession
                : null;

        const effectiveSessionConfig = activeSession || sessionDefaults;

        selectedSessionDuration = effectiveSessionConfig.durationMinutes || 60;
        setSelectedSessionDuration(selectedSessionDuration);

        if (sessionIntentInput && activeSession && activeSession.intent) {
            sessionIntentInput.value = activeSession.intent;
        }

        if (eyeBreakToggle) {
            eyeBreakToggle.checked =
                effectiveSessionConfig.eyeBreakEnabled !== false;
        }

        if (waterReminderToggle) {
            waterReminderToggle.checked = !!effectiveSessionConfig.waterReminderEnabled;
        }
        if (waterIntervalSelect && effectiveSessionConfig.waterReminderInterval) {
            waterIntervalSelect.value =
                String(effectiveSessionConfig.waterReminderInterval);
        }

        if (movementReminderToggle) {
            movementReminderToggle.checked =
                !!effectiveSessionConfig.movementReminderEnabled;
        }
        if (movementIntervalSelect && effectiveSessionConfig.movementReminderInterval) {
            movementIntervalSelect.value =
                String(effectiveSessionConfig.movementReminderInterval);
        }

        // Ensure blocklist is correctly saved in background
        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: savedBlockList });
    });

    // Update reminder time setting
    if (reminderTime) {
        reminderTime.addEventListener("change", () => {
            const minutes = parseInt(reminderTime.value, 10);
            sendAnalyticsEvent('set_focus_reminder', {
                reminder_time: minutes
            });
            chrome.storage.local.set({ focusReminderMinutes: minutes }, () => {
                chrome.runtime.sendMessage({
                    action: "updateFocusReminderMinutes",
                    minutes,
                });
            });
        });
    }

    // Toggle focus mode
    toggleBtn.addEventListener("change", () => {
        const desiredState = toggleBtn.checked;
        chrome.runtime.sendMessage({ action: "setBlockingState", isBlocking: desiredState }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error toggling blocking:", chrome.runtime.lastError);
                toggleBtn.checked = !toggleBtn.checked; // Revert if there was an error
            }

            let event = toggleBtn.checked ? 'focusmode_on' : 'focusmode_off'
            sendAnalyticsEvent(event)

            updateReminderVisibility() ; 
            updateToggleStatus();
        });
    });

    // Block current website button
    if (blockThisBtn) {
      blockThisBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                try {
                    const url = new URL(tabs[0].url);
                    const domain = url.hostname.replace(/^www\./, '').toLowerCase();
                    const rootDomain = getRootDomain(domain)
                    
                    // Check if domain is already in the list
                    const inputs = Array.from(websitesContainer.querySelectorAll(".website-input-group input"));
                    const exists = inputs.some(input => input.value.trim().toLowerCase() === rootDomain);
                    
                    if (!exists) {
                        addBlockListRow(rootDomain);
                        saveBlockList();
                        showBlockFeedback(`${rootDomain} has been blocked`);
                        sendAnalyticsEvent('website_blocked_via_button', {
                            website_url: url 
                        })
                    } else {
                        showBlockFeedback(`${rootDomain} is already blocked`);
                    }
                } catch (e) {
                    console.log("Invalid URL");
                }
            }
        });
      });
    }

    // Add new website input
    if (addSiteBtn) {
        addSiteBtn.addEventListener("click", () => {
            addBlockListRow("");
        });
    }

    function addBlockListRow(url) {
        const row = document.createElement("div");
        row.className = "website-input-group";

        const input = document.createElement("input");
        input.type = "text";
        input.value = url;
        input.placeholder = "Enter website URL";

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "🗑️";

        input.addEventListener("change", () => {
            const siteValue = input.value.trim().toLowerCase();
            input.value = siteValue;

            if (siteValue) {
                sendAnalyticsEvent('website_blocked', {
                    website_url: siteValue
                });
            }

            saveBlockList(); 
        });

        row.appendChild(input);
        row.appendChild(deleteBtn);
        websitesContainer.insertBefore(row, websitesContainer.firstChild);

        if (isLocked) {
            deleteBtn.disabled = true;
        }
    }

    // Handle delete clicks via event delegation to ensure all rows (existing and new) respond
    if (websitesContainer) {
        websitesContainer.addEventListener("click", (event) => {
            const target = event.target;
            const deleteBtn = target.closest(".delete-btn");
            if (!deleteBtn) return;

            if (isLocked) {
                // Focus Lock: silently ignore delete while locked
                return;
            }

            const row = deleteBtn.closest(".website-input-group");
            if (!row) return;

            const input = row.querySelector("input");
            const siteValue = input ? input.value.trim().toLowerCase() : "";

            if (siteValue) {
                sendAnalyticsEvent('website_unblocked', {
                    website_url: siteValue
                });
            }

            row.remove();
            saveBlockList();
        });
    }

    function saveBlockList() {
        const sites = Array.from(websitesContainer.querySelectorAll(".website-input-group input"))
            .map(input => input.value.trim())
            .filter(Boolean);

        const uniqueSites = Array.from(new Set(sites.map(site => site.toLowerCase())));

        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: uniqueSites }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error while updating blocklist:", chrome.runtime.lastError);
            } else {
                console.log("Blocklist updated successfully");
            }
        });
    }

    function showBlockFeedback(message) {
        if (!blockFeedback) return;
        blockFeedback.textContent = message;
        if (blockFeedbackTimeout) {
            clearTimeout(blockFeedbackTimeout);
        }
        blockFeedbackTimeout = setTimeout(() => {
            blockFeedback.textContent = "";
        }, 2500);
    }

    // Focus Mode popup view analytics
    sendAnalyticsEvent('page_view', {
        page_title: 'Focus mode popup opened',
    });

    // Focus Lock wiring
    if (lockActivateBtn) {
        lockActivateBtn.addEventListener("click", handleLockActivation);
    } else if (lockDurationSelect) {
        // If there is no explicit button, activating the lock on change
        lockDurationSelect.addEventListener("change", handleLockActivation);
    }

    // Session duration selection
    if (sessionDuration45) {
        sessionDuration45.addEventListener("click", () => {
            setSelectedSessionDuration(45);
            persistSessionDefaults({ durationMinutes: 45 });
        });
    }
    if (sessionDuration60) {
        sessionDuration60.addEventListener("click", () => {
            setSelectedSessionDuration(60);
            persistSessionDefaults({ durationMinutes: 60 });
        });
    }
    if (sessionDuration90) {
        sessionDuration90.addEventListener("click", () => {
            setSelectedSessionDuration(90);
            persistSessionDefaults({ durationMinutes: 90 });
        });
    }
    if (sessionDuration120) {
        sessionDuration120.addEventListener("click", () => {
            setSelectedSessionDuration(120);
            persistSessionDefaults({ durationMinutes: 120 });
        });
    }

    // Session reminder toggles and intervals
    if (eyeBreakToggle) {
        eyeBreakToggle.addEventListener("change", () => {
            persistSessionDefaults({ eyeBreakEnabled: eyeBreakToggle.checked });
        });
    }

    if (waterReminderToggle) {
        waterReminderToggle.addEventListener("change", () => {
            persistSessionDefaults({ waterReminderEnabled: waterReminderToggle.checked });
        });
    }
    if (waterIntervalSelect) {
        waterIntervalSelect.addEventListener("change", () => {
            const minutes = parseInt(waterIntervalSelect.value, 10);
            persistSessionDefaults({ waterReminderInterval: minutes });
        });
    }

    if (movementReminderToggle) {
        movementReminderToggle.addEventListener("change", () => {
            persistSessionDefaults({ movementReminderEnabled: movementReminderToggle.checked });
        });
    }
    if (movementIntervalSelect) {
        movementIntervalSelect.addEventListener("change", () => {
            const minutes = parseInt(movementIntervalSelect.value, 10);
            persistSessionDefaults({ movementReminderInterval: minutes });
        });
    }

    // Start Work Session button
    if (startSessionBtn) {
        startSessionBtn.addEventListener("click", () => {
            const intent = sessionIntentInput ? sessionIntentInput.value.trim() : "";

            const config = {
                durationMinutes: selectedSessionDuration,
                intent,
                eyeBreakEnabled: eyeBreakToggle ? eyeBreakToggle.checked : true,
                waterReminderEnabled: waterReminderToggle ? waterReminderToggle.checked : false,
                waterReminderInterval: waterIntervalSelect
                    ? parseInt(waterIntervalSelect.value, 10)
                    : 60,
                movementReminderEnabled: movementReminderToggle ? movementReminderToggle.checked : false,
                movementReminderInterval: movementIntervalSelect
                    ? parseInt(movementIntervalSelect.value, 10)
                    : 60,
            };

            // Persist defaults for future sessions
            sessionDefaults = {
                durationMinutes: config.durationMinutes,
                eyeBreakEnabled: config.eyeBreakEnabled,
                waterReminderEnabled: config.waterReminderEnabled,
                waterReminderInterval: config.waterReminderInterval,
                movementReminderEnabled: config.movementReminderEnabled,
                movementReminderInterval: config.movementReminderInterval,
            };

            chrome.storage.local.set({
                sessionDefaults,
                lastSessionIntent: intent,
            });

            chrome.runtime.sendMessage(
                { action: "startWorkSession", config },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error starting work session:", chrome.runtime.lastError);
                        return;
                    }

                    if (response && response.success) {
                        // Ensure the Focus Mode toggle reflects that it's now ON
                        if (toggleBtn) {
                            toggleBtn.checked = true;
                            updateReminderVisibility();
                            updateToggleStatus();
                        }
                    }
                }
            );
        });
    }


    function persistSessionDefaults(partial) {
        sessionDefaults = {
            ...sessionDefaults,
            ...partial,
        };
        chrome.storage.local.set({ sessionDefaults });
    }

    function sendAnalyticsEvent(eventName, eventData = {}) {
        const url = `https://www.google-analytics.com/mp/collect?measurement_id=G-H8DV3RPYLD&api_secret=4vTnGdy6RbGlsphPmyOJTQ`;

        const payload = {
            client_id: clientId, // Unique user ID
            events: [{
                name: eventName,
                params: eventData
            }]
        };

        fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(response => {
            console.log(`Event sent with name: ${eventName} and 
                client Id: ${clientId} with response: ${response.status}`);
        }).catch(error => {
            console.error('Error sending event:', error);
        });
    }


});
