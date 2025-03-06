
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("enable-btn");
    const websiteList = document.getElementById("website-list");
    const addSiteBtn = document.getElementById("add-website-btn");

    chrome.storage.sync.get(["isBlocking", "blockList"], (data) => {
        toggleBtn.textContent = data.isBlocking ? "Disable" : "Enable";
        
        // Clear default website inputs
        while (websiteList.children.length > 1) {
            websiteList.removeChild(websiteList.firstChild);
        }
        
        // Add saved websites
        const savedBlockList = data.blockList || [];
        savedBlockList.forEach(site => addBlockListRow(site));
        
        // Ensure blocklist is correctly saved
        chrome.runtime.sendMessage({ action: "updateBlockList", blockList: savedBlockList });
    });

    toggleBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "toggleBlocking" });
        toggleBtn.textContent = toggleBtn.textContent === "Enable" ? "Disable" : "Enable";
    });

    addSiteBtn.addEventListener("click", () => addBlockListRow(""));

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
        
        // Insert before the add button
        websiteList.insertBefore(row, addSiteBtn);
    }

    function saveBlockList() {
        const sites = Array.from(websiteList.querySelectorAll(".website-input-group input"))
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
