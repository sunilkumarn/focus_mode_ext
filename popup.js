
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggle-btn");
    const websitesContainer = document.getElementById("websites-container");
    const addSiteBtn = document.getElementById("add-website-btn");
    const blockThisBtn = document.getElementById("block-this-btn");
    const reminderTime = document.getElementById("reminder-time");

    // Initialize popup state
    chrome.storage.sync.get(["isBlocking", "blockList", "reminderInterval"], (data) => {
        toggleBtn.checked = data.isBlocking || false;

        // Add saved websites
        const savedBlockList = data.blockList || [];
        savedBlockList.forEach(site => addBlockListRow(site));

        // Set saved reminder time (default 10 minutes)
        const savedReminderMinutes = data.reminderInterval ? data.reminderInterval / (60 * 1000) : 10;
        reminderTime.value = savedReminderMinutes.toString();

        // Ensure blocklist is correctly saved
        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: savedBlockList });
    });

    // Update reminder time setting
    reminderTime.addEventListener("change", () => {
        const minutes = parseInt(reminderTime.value);
        const milliseconds = minutes * 60 * 1000;
        chrome.storage.sync.set({ reminderInterval: milliseconds }, () => {
            chrome.runtime.sendMessage({ action: "updateReminderInterval", reminderInterval: milliseconds });
        });
    });

    // Toggle focus mode
    toggleBtn.addEventListener("change", () => {
        chrome.runtime.sendMessage({ action: "toggleBlocking" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error toggling blocking:", chrome.runtime.lastError);
                toggleBtn.checked = !toggleBtn.checked; // Revert if there was an error
            }
        });
    });

    // Block current website button
    blockThisBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                try {
                    const url = new URL(tabs[0].url);
                    const domain = url.hostname.replace(/^www\./, '');
                    
                    // Check if domain is already in the list
                    const inputs = Array.from(websitesContainer.querySelectorAll(".website-input-group input"));
                    const exists = inputs.some(input => input.value === domain);
                    
                    if (!exists) {
                        addBlockListRow(domain);
                        saveBlockList();
                    }
                } catch (e) {
                    console.error("Invalid URL:", e);
                }
            }
        });
    });

    // Add new website input
    addSiteBtn.addEventListener("click", () => {
        addBlockListRow("");
    });

    function addBlockListRow(url) {
        const row = document.createElement("div");
        row.className = "website-input-group";

        const input = document.createElement("input");
        input.type = "text";
        input.value = url;
        input.placeholder = "Enter website URL";

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "🗑️";

        deleteBtn.addEventListener("click", () => {
            row.remove();
            saveBlockList();
        });

        input.addEventListener("change", saveBlockList);

        row.appendChild(input);
        row.appendChild(deleteBtn);

        websitesContainer.appendChild(row);
    }

    function saveBlockList() {
        const sites = Array.from(websitesContainer.querySelectorAll(".website-input-group input"))
            .map(input => input.value.trim())
            .filter(Boolean);

        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: sites }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error while updating blocklist:", chrome.runtime.lastError);
            } else {
                console.log("Blocklist updated successfully");
            }
        });
    }
});
