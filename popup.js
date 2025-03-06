document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggle");
    const blockListContainer = document.getElementById("blockListContainer");
    const addSiteBtn = document.getElementById("addSite");

    chrome.storage.sync.get(["isBlocking", "blockList"], (data) => {
        toggleBtn.textContent = data.isBlocking ? "Disable" : "Enable";
        const savedBlockList = data.blockList || [];
        savedBlockList.forEach(addBlockListRow);
        // Ensure blocklist is correctly saved in the first place
        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: savedBlockList });
    });

    toggleBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "toggleBlocking" });
        toggleBtn.textContent = toggleBtn.textContent === "Enable" ? "Disable" : "Enable";
    });

    addSiteBtn.addEventListener("click", () => addBlockListRow(""));

    function addBlockListRow(url) {
        const row = document.createElement("div");
        const input = document.createElement("input");
        const removeBtn = document.createElement("button");
        input.type = "text";
        input.value = url;
        removeBtn.textContent = "X";
        removeBtn.addEventListener("click", () => {
            row.remove();
            saveBlockList();
        });
        input.addEventListener("change", saveBlockList);
        row.appendChild(input);
        row.appendChild(removeBtn);
        blockListContainer.appendChild(row);
    }

    function saveBlockList() {
        const sites = Array.from(blockListContainer.querySelectorAll("input")).map(input => input.value.trim()).filter(Boolean);
        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: sites }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error while updating blocklist:", chrome.runtime.lastError);
            } else {
                console.log("Blocklist updated successfully");
                chrome.runtime.sendMessage({ action: "toggleBlocking" }); // Apply changes
            }
        });
    }
    
});
