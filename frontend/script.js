
document.addEventListener("DOMContentLoaded", () => {
    // Smooth navigation for all internal links
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener("click", (event) => {
            const targetId = link.getAttribute("href");
            const target = document.querySelector(targetId);

            if (target) {
                event.preventDefault();
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    });

    // Ensure verification links require authentication
    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    const isLoggedIn = !!(user && token);

    document.querySelectorAll('a[href="dashboard.html"]').forEach(btn => {
        if (!isLoggedIn) {
            btn.href = "auth.html?redirect=dashboard.html";
        }
    });

    const heroAuthBtn = document.getElementById("heroAuthBtn");
    if (heroAuthBtn && isLoggedIn) {
        heroAuthBtn.href = "profile.html";
        heroAuthBtn.innerHTML = `👤 Student Profile (${(user.name || "User").split(" ")[0]})`;
    }

    console.log("ApplyReady AI frontend loaded successfully!");
});
