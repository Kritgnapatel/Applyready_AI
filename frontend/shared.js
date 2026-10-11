/**
 * ApplyReady AI — Shared Frontend Utilities
 * Common constants, fetch wrapper, and formatting helpers.
 */

"use strict";

// ── Backend URL ───────────────────────────────────────────────────────────────
const API_BASE = (typeof window !== "undefined" && window.location.protocol.startsWith("http") && window.location.port === "5000")
    ? ""
    : "http://localhost:5000";

// ── Auth helpers ─────────────────────────────────────────────────────────────
function getAuthToken() {
    try {
        return localStorage.getItem("applyready_token") || null;
    } catch {
        return null;
    }
}

function getAuthUser() {
    try {
        const raw = localStorage.getItem("applyready_user");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setAuth(token, user) {
    try {
        if (token) localStorage.setItem("applyready_token", token);
        if (user) localStorage.setItem("applyready_user", JSON.stringify(user));
    } catch (e) {
        console.warn("Could not save auth to localStorage:", e);
    }
}

function clearAuth() {
    try {
        localStorage.removeItem("applyready_token");
        localStorage.removeItem("applyready_user");
    } catch {}
}

async function logoutUser(event) {
    if (event) event.preventDefault();
    try {
        await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    clearAuth();
    window.location.href = "index.html";
}

// ── Theme Management ─────────────────────────────────────────────────────────
function getTheme() {
    try {
        const saved = localStorage.getItem("applyready_theme");
        if (saved === "light" || saved === "dark") return saved;
        return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)
            ? "light"
            : "dark";
    } catch {
        return "dark";
    }
}

function setTheme(theme) {
    const validTheme = theme === "light" ? "light" : "dark";
    try {
        localStorage.setItem("applyready_theme", validTheme);
    } catch {}
    document.documentElement.setAttribute("data-theme", validTheme);
    updateThemeToggleUI(validTheme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: validTheme } }));
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || getTheme();
    const next = current === "light" ? "dark" : "light";
    setTheme(next);
}

function updateThemeToggleUI(theme) {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;
    const isDark = theme === "dark";
    btn.setAttribute("aria-label", isDark ? "Switch to Light Theme" : "Switch to Dark Theme");
    btn.title = isDark ? "Switch to Light Theme" : "Switch to Dark Theme";
    btn.innerHTML = isDark
        ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2"></path>
            <path d="M12 20v2"></path>
            <path d="m4.93 4.93 1.41 1.41"></path>
            <path d="m17.66 17.66 1.41 1.41"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
            <path d="m6.34 17.66-1.41 1.41"></path>
            <path d="m19.07 4.93-1.41 1.41"></path>
           </svg>`
        : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
           </svg>`;
}

// Initial theme setup (syncs immediately)
(function initTheme() {
    if (typeof document !== "undefined") {
        const theme = getTheme();
        document.documentElement.setAttribute("data-theme", theme);
    }
})();

function renderNavAuth() {
    const nav = document.querySelector("header nav");
    if (!nav) return;

    // 1. Ensure Theme Toggle exists in navigation
    let themeBtn = document.getElementById("themeToggleBtn");
    if (!themeBtn) {
        themeBtn = document.createElement("button");
        themeBtn.type = "button";
        themeBtn.id = "themeToggleBtn";
        themeBtn.className = "theme-toggle-btn";
        themeBtn.onclick = toggleTheme;
        nav.appendChild(themeBtn);
        updateThemeToggleUI(document.documentElement.getAttribute("data-theme") || getTheme());
    }

    // 2. Ensure Auth Section exists
    let authNav = document.getElementById("navAuthSection");
    if (!authNav) {
        authNav = document.createElement("div");
        authNav.id = "navAuthSection";
        authNav.style.cssText = "display: inline-flex; align-items: center; gap: 10px;";
        nav.appendChild(authNav);
    }

    const user = getAuthUser();
    if (user && user.name) {
        const firstName = user.name.split(" ")[0];
        const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;
        authNav.innerHTML = `
            <a href="profile.html" class="nav-profile-pill" title="View Profile (${escapeHtml(user.email)})">
                <img src="${avatarUrl}" alt="${escapeHtml(user.name)}" class="nav-avatar-img">
                <span>${escapeHtml(firstName)}</span>
            </a>
            <a href="#" onclick="logoutUser(event)" class="nav-logout-btn" title="Sign Out">Sign Out</a>
        `;
    } else {
        authNav.innerHTML = `
            <a href="auth.html?mode=login" class="nav-auth-link">Sign In</a>
            <a href="auth.html?mode=register" class="nav-btn nav-register-btn">Register</a>
        `;
    }
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderNavAuth);
    } else {
        renderNavAuth();
    }
}

function requirePageAuth(redirectTo = null) {
    if (typeof window !== "undefined" && window.location.search) {
        try {
            const params = new URLSearchParams(window.location.search);
            const queryToken = params.get("token");
            if (queryToken) {
                localStorage.setItem("applyready_token", queryToken);
                if (!localStorage.getItem("applyready_user")) {
                    localStorage.setItem("applyready_user", JSON.stringify({ name: "Student Candidate", email: "candidate@applyready.ai" }));
                }
            }
        } catch {}
    }
    const token = getAuthToken();
    const user = getAuthUser();
    if (!token || !user) {
        const pageName = window.location.pathname.split("/").pop() || "dashboard.html";
        const dest = redirectTo || (pageName + window.location.search);
        window.location.replace(`auth.html?redirect=${encodeURIComponent(dest)}`);
        return false;
    }
    return true;
}

// ── Safe JSON fetch with timeout ──────────────────────────────────────────────
async function apiFetch(path, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const token = getAuthToken();
        const headers = { ...(options.headers || {}) };
        if (token && !headers["Authorization"]) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Server returned an invalid response (HTTP ${response.status}).`);
        }

        if (response.status === 401) {
            clearAuth();
            const currentPage = window.location.pathname.split("/").pop();
            if (currentPage && !currentPage.includes("auth.html") && !currentPage.includes("index.html")) {
                const dest = currentPage + window.location.search;
                window.location.replace(`auth.html?redirect=${encodeURIComponent(dest)}&expired=1`);
            }
            throw new Error(data.error || "Authentication required. Please sign in or register.");
        }

        if (!response.ok) {
            throw new Error(data.error || data.message || `Request failed (HTTP ${response.status}).`);
        }

        return data;
    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error("Request timed out. Check that the backend server is running.");
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ── Status badge helpers ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
    eligible:     { icon: "✅", label: "Eligible",          color: "#16a34a", bg: "#16a34a18" },
    not_met:      { icon: "❌", label: "Not Met",           color: "#dc2626", bg: "#dc262618" },
    missing:      { icon: "⚠️", label: "Missing",           color: "#dc2626", bg: "#dc262618" },
    needs_review: { icon: "🔍", label: "Needs Review",      color: "#d97706", bg: "#d9770618" },
    match:        { icon: "✅", label: "Match",             color: "#16a34a", bg: "#16a34a18" },
    mismatch:     { icon: "❌", label: "Mismatch",          color: "#dc2626", bg: "#dc262618" },
    unknown:      { icon: "❓", label: "Unknown",           color: "#64748b", bg: "#64748b18" },
};

function getStatusConfig(status) {
    return STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
}

function createStatusBadge(status) {
    const cfg = getStatusConfig(status);
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.textContent = `${cfg.icon} ${cfg.label}`;
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        color: ${cfg.color};
        background: ${cfg.bg};
        border: 1px solid ${cfg.color}44;
    `;
    return badge;
}

// ── Card builder ──────────────────────────────────────────────────────────────
function createCard({ title, description, status, icon, evidence, nextStep, severity } = {}) {
    const cfg = status ? getStatusConfig(status) : null;

    const card = document.createElement("div");
    card.className = "result-card";
    card.style.cssText = `
        padding: 16px 20px;
        background: ${cfg ? cfg.bg : "var(--bg-card, #111a2e)"};
        border: 1px solid var(--border-color, #ffffff15);
        border-left: 4px solid ${cfg ? cfg.color : "var(--brand-accent, #3b82f6)"};
        border-radius: 10px;
        margin-bottom: 12px;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display: flex; align-items: center; gap: 10px; margin-bottom: 6px;";

    if (icon) {
        const iconEl = document.createElement("span");
        iconEl.textContent = icon;
        iconEl.style.fontSize = "16px";
        header.append(iconEl);
    }

    const titleEl = document.createElement("strong");
    titleEl.textContent = title || "—";
    titleEl.style.cssText = "font-size: 14px; font-weight: 600; color: var(--text-primary, #f4f7ff);";
    header.append(titleEl);

    if (status) header.append(createStatusBadge(status));
    card.append(header);

    if (description) {
        const desc = document.createElement("p");
        desc.textContent = description;
        desc.style.cssText = "color: var(--text-secondary, #a1acc2); font-size: 13px; margin: 4px 0;";
        card.append(desc);
    }

    if (evidence) {
        const ev = document.createElement("p");
        ev.style.cssText = "color: var(--text-muted, #7c8faa); font-size: 12px; font-style: italic; margin-top: 6px; padding: 6px 10px; background: var(--bg-subtle, #ffffff08); border-radius: 6px; border: 1px solid var(--border-color, #ffffff10);";
        ev.textContent = `📋 Evidence: ${typeof evidence === "object" ? (evidence.text || JSON.stringify(evidence)) : evidence}`;
        card.append(ev);
    }

    if (nextStep) {
        const ns = document.createElement("p");
        ns.style.cssText = "color: var(--brand-accent, #38bdf8); font-size: 12px; font-weight: 500; margin-top: 8px;";
        ns.textContent = `→ ${nextStep}`;
        card.append(ns);
    }

    return card;
}

// ── Format field name ─────────────────────────────────────────────────────────
function formatFieldName(field) {
    const NAMES = {
        cgpa: "CGPA",
        sgpa: "SGPA",
        graduation_year: "Graduation Year",
        admission_year: "Admission Year",
        academic_year: "Academic Year",
        degree: "Degree",
        year_of_study: "Year of Study",
    };
    return NAMES[field] || field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Session helpers ───────────────────────────────────────────────────────────
function saveApplication(data) {
    try {
        sessionStorage.setItem("applyReadyApplication", JSON.stringify(data));
    } catch {
        console.warn("Could not save application to sessionStorage.");
    }
}

function loadApplication() {
    try {
        const raw = sessionStorage.getItem("applyReadyApplication");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// ── Severity icon ─────────────────────────────────────────────────────────────
function getSeverityIcon(severity) {
    if (severity === "high") return "🔴";
    if (severity === "medium") return "🟡";
    return "🟢";
}

// ── HTML Escape helper ────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── Markdown renderer helper (Safe HTML) ──────────────────────────────────────
function renderMarkdown(md) {
    if (!md || typeof md !== "string") return "";
    let safe = escapeHtml(md);

    // Headers
    safe = safe.replace(/^### (.*?)$/gm, '<h4 class="md-h4" style="margin:12px 0 6px;color:var(--text);font-size:15px;font-weight:600;">$1</h4>');
    safe = safe.replace(/^## (.*?)$/gm, '<h3 class="md-h3" style="margin:16px 0 8px;color:var(--text);font-size:16px;font-weight:700;">$1</h3>');
    safe = safe.replace(/^# (.*?)$/gm, '<h2 class="md-h2" style="margin:18px 0 10px;color:var(--text);font-size:18px;font-weight:700;">$1</h2>');

    // Bold & Italics
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');

    // Lists
    const lines = safe.split("\n");
    let inList = false;
    const out = [];

    for (let line of lines) {
        const bulletMatch = line.match(/^(\s*)[•\-\*]\s+(.*)$/);
        if (bulletMatch) {
            if (!inList) {
                out.push('<ul style="margin:6px 0 10px 20px;padding:0;line-height:1.6;">');
                inList = true;
            }
            out.push(`<li style="margin-bottom:4px;">${bulletMatch[2]}</li>`);
        } else {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            const trimmed = line.trim();
            if (trimmed.length > 0 && !trimmed.startsWith('<h')) {
                out.push(`<p style="margin:6px 0 10px;line-height:1.6;">${trimmed}</p>`);
            } else if (trimmed.startsWith('<h')) {
                out.push(trimmed);
            }
        }
    }
    if (inList) {
        out.push('</ul>');
    }

    return out.join("\n");
}

