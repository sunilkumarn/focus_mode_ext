document.addEventListener("DOMContentLoaded", function () {
    const addWebsiteBtn = document.getElementById("add-website-btn");
    const websiteList = document.getElementById("website-list");

    addWebsiteBtn.addEventListener("click", function () {
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
        websiteList.appendChild(div);
    });

    document.querySelectorAll(".delete-btn").forEach((btn) =>
        btn.addEventListener("click", function () {
            btn.parentElement.remove();
        })
    );
});
