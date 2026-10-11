/**
 * ApplyReady AI — Profile & Application History Controller
 */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    // Check authentication
    const token = getAuthToken();
    const user = getAuthUser();

    if (!token || !user) {
        window.location.href = "auth.html?redirect=profile.html";
        return;
    }

    // Populate initial UI from local session
    displayUserProfile(user);

    // Fetch fresh user data from server
    await syncUserProfile();

    // Fetch user's applications
    await loadUserApplications();
});

function displayUserProfile(user) {
    if (!user) return;

    // Header & Banner elements
    const nameEl = document.getElementById("profileName");
    const emailEl = document.getElementById("profileEmail");
    const avatarEl = document.getElementById("profileAvatar");
    const authBadgeEl = document.getElementById("authBadge");
    const targetYearStat = document.getElementById("statTargetYear");

    if (nameEl) nameEl.textContent = user.name || "Student User";
    if (emailEl) emailEl.textContent = user.email || "";

    if (avatarEl) {
        avatarEl.src = user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || "Student")}`;
    }

    if (authBadgeEl) {
        if (user.authProvider === "google") {
            authBadgeEl.textContent = "Google Account";
            authBadgeEl.className = "auth-provider-badge google";
        } else {
            authBadgeEl.textContent = "Student Account";
            authBadgeEl.className = "auth-provider-badge";
        }
    }

    if (targetYearStat) {
        targetYearStat.textContent = user.gradYear || "2028";
    }

    // Form inputs
    const editName = document.getElementById("editName");
    const editEmail = document.getElementById("editEmail");
    const editCollege = document.getElementById("editCollege");
    const editDegree = document.getElementById("editDegree");
    const editGradYear = document.getElementById("editGradYear");

    if (editName) editName.value = user.name || "";
    if (editEmail) editEmail.value = user.email || "";
    if (editCollege) editCollege.value = user.college || "";
    if (editDegree) editDegree.value = user.degree || "";
    if (editGradYear) editGradYear.value = user.gradYear || "";
}

async function syncUserProfile() {
    try {
        const data = await apiFetch("/api/auth/me");
        if (data.status === "ok" && data.user) {
            setAuth(getAuthToken(), data.user);
            displayUserProfile(data.user);

            const totalApps = document.getElementById("statTotalApps");
            if (totalApps && data.stats) {
                totalApps.textContent = data.stats.totalApplications || "0";
            }
        }
    } catch (err) {
        console.warn("Could not sync profile with server:", err.message);
    }
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    const msgEl = document.getElementById("profileMessage");
    const saveBtn = document.getElementById("saveProfileBtn");

    const name = document.getElementById("editName").value.trim();
    const college = document.getElementById("editCollege").value.trim();
    const degree = document.getElementById("editDegree").value.trim();
    const gradYear = document.getElementById("editGradYear").value.trim();

    if (!name || name.length < 2) {
        showProfileMessage("Please enter a valid full name.", true);
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
        const res = await apiFetch("/api/auth/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, college, degree, gradYear }),
        });

        if (res.status === "ok" && res.user) {
            setAuth(getAuthToken(), res.user);
            displayUserProfile(res.user);
            renderNavAuth(); // Refresh nav pill
            showProfileMessage("Academic profile credentials updated successfully!", false);
        }
    } catch (err) {
        showProfileMessage(err.message || "Failed to save profile changes.", true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
    }
}

function showProfileMessage(msg, isError = true) {
    const el = document.getElementById("profileMessage");
    if (!el) return;
    el.textContent = msg;
    el.className = `profile-msg ${isError ? "error" : "success"}`;
    el.classList.remove("hidden");
    setTimeout(() => {
        el.classList.add("hidden");
    }, 4000);
}

// ── Applications List ────────────────────────────────────────────────────────
async function loadUserApplications() {
    const container = document.getElementById("applicationsList");
    if (!container) return;

    container.innerHTML = `<div class="loading-state">Loading your application reports…</div>`;

    try {
        const data = await apiFetch("/api/auth/applications");
        const apps = data.applications || [];

        // Update stats
        const totalAppsEl = document.getElementById("statTotalApps");
        const eligibleAppsEl = document.getElementById("statEligibleApps");
        if (totalAppsEl) totalAppsEl.textContent = apps.length;

        const eligibleCount = apps.filter(a => a.eligibilityStatus === "eligible").length;
        if (eligibleAppsEl) eligibleAppsEl.textContent = eligibleCount;

        if (apps.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <p>No applications verified under this account yet.</p>
                    <a href="dashboard.html" class="primary-btn">Start Your First Verification →</a>
                </div>
            `;
            return;
        }

        container.replaceChildren();

        apps.forEach((app) => {
            const card = document.createElement("div");
            card.className = "app-history-card";

            const dateStr = app.createdAt ? new Date(app.createdAt).toLocaleDateString(undefined, {
                year: "numeric", month: "short", day: "numeric"
            }) : "Recent";

            const statusCfg = getStatusConfig(app.eligibilityStatus || "needs_review");

            card.innerHTML = `
                <div class="app-info-col">
                    <h4>${escapeHtml(app.opportunityName || "Untitled Opportunity")}</h4>
                    <div class="app-meta-row">
                        <span class="app-domain-chip">${escapeHtml(app.domain || "Application")}</span>
                        <span>• Added ${dateStr}</span>
                        ${app.extractedCgpa ? `<span>• Extracted CGPA: <strong>${app.extractedCgpa}</strong></span>` : ""}
                    </div>
                </div>
                <div class="app-action-col">
                    <span class="status-badge" style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; color:${statusCfg.color}; background:${statusCfg.bg}; border:1px solid ${statusCfg.color}44;">
                        ${statusCfg.icon} ${statusCfg.label}
                    </span>
                    <a href="review.html?id=${encodeURIComponent(app.id)}" class="view-report-link" onclick="openApplicationReport('${app.id}')">
                        Open Report →
                    </a>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Could not load applications: ${escapeHtml(err.message)}</p>
                <button type="button" class="secondary-btn" onclick="loadUserApplications()">Try Again</button>
            </div>
        `;
    }
}

function openApplicationReport(appId) {
    sessionStorage.setItem("currentApplicationId", appId);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
