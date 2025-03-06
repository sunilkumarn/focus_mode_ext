document.addEventListener("DOMContentLoaded", function () {
    const addWebsiteBtn = document.getElementById("add-website-btn");
    const websiteList = document.getElementById("website-list");
    
    // Remove any existing click handler from popup.js to avoid conflicts
    const toggleBtn = document.getElementById("enable-btn");
    toggleBtn.replaceWith(toggleBtn.cloneNode(true));
    const newToggleBtn = document.getElementById("enable-btn");
    
    // Add the toggle functionality here
    newToggleBtn.addEventListener("click", function() {
        chrome.runtime.sendMessage({ action: "toggleBlocking" });
        if (newToggleBtn.textContent === "Enable") {
            newToggleBtn.textContent = "Disable";
            newToggleBtn.classList.add("disabled");
        } else {
            newToggleBtn.textContent = "Enable";
            newToggleBtn.classList.remove("disabled");
        }
    });

    addWebsiteBtn.addEventListener("click", function () {
</old_str>
        const div = document.createElement("div");
        div.classList.add("website-input-group");

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Enter website URL";

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("delete-btn");
        deleteBtn.innerHTML = "🗑️";

        deleteBtn.addEventListener("click", function () {
            div.remove();
        });

        div.appendChild(input);
        div.appendChild(deleteBtn);
        websiteList.insertBefore(div, addWebsiteBtn);
    });

    document.querySelectorAll(".delete-btn").forEach((btn) =>
        btn.addEventListener("click", function () {
            btn.parentElement.remove();
        })
    );
});
