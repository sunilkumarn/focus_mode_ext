let isBlocking = false;
let blockList = ["facebook.com", "youtube.com", "twitter.com"]; // Default blocklist
let reminderTimeout;
const reminderInterval = 10 * 60 * 1000; // 10 minutes

// Load saved state from storage
chrome.storage.sync.get(["isBlocking", "blockList"], (data) => {
  if (data.isBlocking !== undefined) isBlocking = data.isBlocking;
  if (data.blockList) blockList = data.blockList;
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

// Manage website blocking
function manageBlocking() {
    console.log(`isBlocking: ${isBlocking}`); 
    if (isBlocking) {
        const urlFilter = blockList.length > 0
            ? blockList.map(site => `*://*.${site}/*`).join("|")
            : null;

        console.log(`urlFilter: ${urlFilter}`) ; 

        if (urlFilter) {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [1],
                addRules: [{
                    id: 1,
                    priority: 1,
                    action: { type: "block" },
                    condition: {
                        urlFilter: urlFilter,
                        resourceTypes: ["main_frame"],
                    },
                }],
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error updating blocking rules:", chrome.runtime.lastError);
                }
            });

        } else {
            // If no blocklist items, remove blocking rules
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1] });
        }
    } else {
        chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1] }, () => {
            if (chrome.runtime.lastError) {
              console.error("Error removing blocking rules:", chrome.runtime.lastError);
            }
          });
    }
}

// Reset the reminder timer
function resetReminder() {
  if (reminderTimeout) clearTimeout(reminderTimeout);
  if (!isBlocking) {
    reminderTimeout = setTimeout(() => {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon_off_128.png", // Ensure this icon exists
        title: "Focus Reminder",
        message: "You've been browsing too long! Consider re-enabling focus mode.",
      });
    }, reminderInterval);
  }
}
