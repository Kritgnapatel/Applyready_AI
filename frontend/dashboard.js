
"use strict";

// Guard: Require login before accessing dashboard
if (typeof requirePageAuth === "function") {
    requirePageAuth();
}

document.addEventListener("DOMContentLoaded", () => {
    const cards          = document.querySelectorAll(".application-card");
    const continueBtn    = document.getElementById("continueBtn");
    const selectionMsg   = document.getElementById("selectionMessage");
    const serviceStatus  = document.getElementById("serviceStatus");
    const recentSection  = document.getElementById("recentSection");
    const recentList     = document.getElementById("recentList");

    let selectedDomain = null;

    // ── Category selection ───────────────────────────────────────────────────
    cards.forEach((card) => {
        card.addEventListener("click", () => {
            cards.forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
            selectedDomain = card.getAttribute("data-domain");
            continueBtn.disabled = false;
            const LABELS = { scholarship: "Scholarships", internship: "Internships" };
            selectionMsg.textContent = `Selected: ${LABELS[selectedDomain] || selectedDomain}. Click Continue.`;
        });
    });

    continueBtn.addEventListener("click", () => {
        if (!selectedDomain) return;
        window.location.href = `requirements.html?domain=${encodeURIComponent(selectedDomain)}`;
    });

    // ── Service health check ─────────────────────────────────────────────────
    async function checkServiceHealth() {
        if (!serviceStatus) return;
        try {
            const data = await apiFetch("/api/health", {}, 5000);
            const mlOk = data.mlService === "ok";
            const dbOk = data.db === "connected";

            serviceStatus.textContent =
                `● Backend OK${mlOk ? " · ML Ready" : " · ML Offline"}${dbOk ? " · DB Connected" : ""}`;
            serviceStatus.style.color = mlOk ? "#4ade80" : "#fbbf24";
            serviceStatus.style.borderColor = mlOk ? "#4ade8044" : "#fbbf2444";
        } catch {
            serviceStatus.textContent = "● Backend Offline";
            serviceStatus.style.color = "#f87171";
            serviceStatus.style.borderColor = "#f8717144";
        }
    }
    checkServiceHealth();

    // ── Load recent applications ──────────────────────────────────────────────
    async function loadRecentApplications() {
        if (!recentSection || !recentList) return;
        try {
            const data = await apiFetch("/api/applications", {}, 5000);
            const apps = data.applications || [];
            if (!apps.length) return;

            recentSection.style.display = "";
            recentList.replaceChildren();

            apps.forEach((app) => {
                const DOMAIN_ICONS = { scholarship: "🎓", internship: "💼" };
                const STATUS_COLORS = { assessed: "#4ade80", received: "#fbbf24" };

                const item = document.createElement("div");
                item.className = "recent-item interactive-item";
                item.style.cursor = "pointer";
                item.title = "Click to view review or continue";
                item.innerHTML = `
                    <span class="recent-icon">${DOMAIN_ICONS[app.domain] || "📋"}</span>
                    <div class="recent-info">
                        <strong>${app.opportunityName}</strong>
                        <p class="muted">${(app.domain || "").charAt(0).toUpperCase() + (app.domain || "").slice(1)} · ${new Date(app.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <span class="recent-status" style="color: ${STATUS_COLORS[app.status] || "#a1acc2"}">${app.status || "—"} →</span>
                `;

                item.addEventListener("click", async () => {
                    try {
                        item.style.opacity = "0.7";
                        const detail = await apiFetch(`/api/applications/${encodeURIComponent(app.id)}`);
                        if (detail && detail.latestAssessment) {
                            saveApplication({
                                ...detail.application,
                                id: detail.application.appId || detail.application.id,
                                ...detail.latestAssessment,
                            });
                            window.location.href = "review.html";
                        } else {
                            window.location.href = `requirements.html?domain=${encodeURIComponent(app.domain || "scholarship")}`;
                        }
                    } catch (err) {
                        window.location.href = `requirements.html?domain=${encodeURIComponent(app.domain || "scholarship")}`;
                    }
                });

                recentList.append(item);
            });
        } catch {
            // DB not connected — silent fail is fine
        }
    }
    loadRecentApplications();
});
