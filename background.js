let isBlocking = false;
let blockList = [ ]; // Default blocklist
let reminderTimeout;
let reminderInterval = 0; // 0 minutes

// Load saved state from storage
chrome.storage.sync.get(["isBlocking", "blockList", "reminderInterval", "clientId"], (data) => {
  if (data.isBlocking !== undefined) isBlocking = data.isBlocking;
  if (data.blockList) blockList = data.blockList;
  if (data.reminderInterval) reminderInterval = data.reminderInterval;
  updateIcon();
  manageBlocking();
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleBlocking") {
        isBlocking = !isBlocking;
        chrome.storage.sync.set({ isBlocking }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving blocking state:", chrome.runtime.lastError);
            } else {
                updateIcon();
                manageBlocking();
                resetReminder();
                sendResponse({ success: true }); // Respond back to the sender
            }
        });
    } else if (message.action === "updateBlockList") {
        blockList = message.blockList;
        chrome.storage.sync.set({ blockList }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving blocklist:", chrome.runtime.lastError);
                sendResponse({ success: false }); // Respond with failure
            } else {
                manageBlocking();
                sendResponse({ success: true }); // Respond back to the sender
            }
        });
    } else if (message.action === "updateReminderInterval") {
        reminderInterval = message.reminderInterval;
        chrome.storage.sync.set({ reminderInterval }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving reminder interval:", chrome.runtime.lastError);
                sendResponse({ success: false }); // Respond with failure
            } else {
                resetReminder();
                sendResponse({ success: true }); // Respond back to the sender
            }
        });
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

// Reset the reminder timer
function resetReminder() {
    chrome.alarms.clear("focusReminder", () => {
      if (!isBlocking & reminderInterval != 0) {
        chrome.alarms.create("focusReminder", { delayInMinutes: reminderInterval / 60000 });
      }
    });
  }
  
  // Listen for alarm trigger
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "focusReminder") {
        chrome.tabs.create({ url: "distraction.html" });
    }
});
