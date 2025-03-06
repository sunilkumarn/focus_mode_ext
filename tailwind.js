document.addEventListener("DOMContentLoaded", function () {
    // Only handle the delete buttons that are initially on the page
    document.querySelectorAll(".delete-btn").forEach((btn) =>
        btn.addEventListener("click", function () {
            btn.parentElement.remove();
        })
    );
});