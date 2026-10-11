/**
 * ApplyReady AI — Authentication Controller
 * Handles Login, Registration, and Official Google Sign-In via Google Identity Services
 */

"use strict";

let currentMode = "login"; // "login" | "register"
let configuredGoogleClientId = "780557102135-1ss4m4dqqfk95dq6et6k43vqrm98ca8l.apps.googleusercontent.com";

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get("redirect");
    const isExpired = urlParams.get("expired");

    // Check if user is already logged in
    const existingUser = getAuthUser();
    if (existingUser && getAuthToken()) {
        if (!urlParams.get("force")) {
            window.location.href = redirectUrl || "dashboard.html";
            return;
        }
    }

    // Determine initial mode from query string
    const mode = urlParams.get("mode");
    if (mode === "register") {
        switchAuthTab("register");
    } else {
        switchAuthTab("login");
    }

    // Inform user if redirected from a protected verification page
    if (isExpired) {
        showMessage("⚠️ Your session expired. Please sign in to continue verification.", true);
    } else if (redirectUrl) {
        showMessage("🔒 Sign in or register to access application verification.", false);
    }

    // Initialize Google Identity Services
    await setupGoogleIdentity();
});

function switchAuthTab(mode) {
    currentMode = mode;
    clearMessage();

    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");
    const authTitle = document.getElementById("authTitle");
    const authSubtitle = document.getElementById("authSubtitle");
    const groupName = document.getElementById("groupName");
    const registerExtraFields = document.getElementById("registerExtraFields");
    const submitBtn = document.getElementById("submitAuthBtn");
    const authFooterText = document.getElementById("authFooterText");

    if (mode === "register") {
        tabLogin.classList.remove("active");
        tabRegister.classList.add("active");
        authTitle.textContent = "Create an Account";
        authSubtitle.textContent = "Sign up to verify your documents, track opportunities, and get AI insights.";
        groupName.style.display = "block";
        document.getElementById("userName").required = true;
        registerExtraFields.style.display = "block";
        submitBtn.textContent = "Create Account →";
        authFooterText.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="switchAuthTab('login')">Sign in here</a>`;
    } else {
        tabRegister.classList.remove("active");
        tabLogin.classList.add("active");
        authTitle.textContent = "Welcome to ApplyReady AI";
        authSubtitle.textContent = "Sign in to track your applications, view verified reports, and manage your student profile.";
        groupName.style.display = "none";
        document.getElementById("userName").required = false;
        registerExtraFields.style.display = "none";
        submitBtn.textContent = "Sign In →";
        authFooterText.innerHTML = `Don't have an account yet? <a href="javascript:void(0)" onclick="switchAuthTab('register')">Create an account for free</a>`;
    }

    // Re-render Google button with appropriate text (Sign in vs Sign up)
    if (configuredGoogleClientId && window.google?.accounts?.id) {
        renderGoogleOfficialButton();
    }
}

function showMessage(msg, isError = true) {
    const el = document.getElementById("authMessage");
    if (!el) return;
    el.textContent = msg;
    el.className = `auth-message ${isError ? "error" : "success"}`;
    el.classList.remove("hidden");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearMessage() {
    const el = document.getElementById("authMessage");
    if (el) {
        el.textContent = "";
        el.classList.add("hidden");
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById("userPassword");
    const btn = document.getElementById("togglePasswordBtn");
    if (!input || !btn) return;

    if (input.type === "password") {
        input.type = "text";
        btn.textContent = "Hide";
    } else {
        input.type = "password";
        btn.textContent = "Show";
    }
}

// ── Google Identity Services Integration ──────────────────────────────────────
async function setupGoogleIdentity() {
    try {
        const config = await apiFetch("/api/auth/config", {}, 4000);
        if (config?.googleClientId) {
            configuredGoogleClientId = config.googleClientId;
        }
    } catch (e) {
        console.warn("Could not fetch server auth config, using configured client ID:", e.message);
    }

    tryInitGoogleGsi(configuredGoogleClientId);
}

function tryInitGoogleGsi(clientId, retries = 20) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
            google.accounts.id.initialize({
                client_id: clientId,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true,
            });
            renderGoogleOfficialButton();

            // Optionally invoke One Tap account chooser
            try {
                google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed()) {
                        console.log("One Tap not displayed:", notification.getNotDisplayedReason());
                    }
                });
            } catch {}
        } catch (err) {
            console.error("Failed initializing Google Identity Services:", err);
            showGoogleFallback();
        }
    } else if (retries > 0) {
        setTimeout(() => tryInitGoogleGsi(clientId, retries - 1), 200);
    } else {
        console.warn("Google Identity Services SDK took too long to load.");
        showGoogleFallback();
    }
}

function renderGoogleOfficialButton() {
    const container = document.getElementById("googleOfficialBtnContainer");
    if (!container || !window.google?.accounts?.id) return;

    container.innerHTML = "";
    google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: currentMode === "register" ? "signup_with" : "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 380,
    });

    const fallbackBtn = document.getElementById("googleFallbackBtn");
    if (fallbackBtn) fallbackBtn.style.display = "none";
}

function showGoogleFallback() {
    const fallbackBtn = document.getElementById("googleFallbackBtn");
    if (fallbackBtn) fallbackBtn.style.display = "flex";
}

function triggerGoogleAuth() {
    if (window.google?.accounts?.id && configuredGoogleClientId) {
        try {
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed()) {
                    showMessage("Google account popup was blocked or dismissed. Please click the Google button directly.", false);
                }
            });
        } catch (e) {
            showMessage("Google Sign-In is initializing. Please try clicking again.", false);
        }
    } else {
        showMessage("Google Identity Services is currently unavailable. Please sign in with email and password below.", true);
    }
}

/**
 * Handles the authentic ID Token (JWT) returned from Google Identity Services
 */
async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showMessage("Google sign-in did not return a valid credential. Please try again.", true);
        return;
    }

    clearMessage();
    showMessage("Verifying Google account with server…", false);

    try {
        const res = await apiFetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential }),
        });

        setAuth(res.token, res.user);
        showMessage("Google authentication successful! Redirecting…", false);

        setTimeout(() => {
            const redirectUrl = new URLSearchParams(window.location.search).get("redirect");
            window.location.href = redirectUrl || "dashboard.html";
        }, 500);
    } catch (err) {
        showMessage(`Google Sign-In failed: ${err.message}`, true);
    }
}

// ── Form Submit (Email + Password) ────────────────────────────────────────────
async function handleAuthSubmit(event) {
    event.preventDefault();
    clearMessage();

    const submitBtn = document.getElementById("submitAuthBtn");
    const email = document.getElementById("userEmail").value.trim();
    const password = document.getElementById("userPassword").value;

    if (!email || !password) {
        showMessage("Please fill in all required fields.", true);
        return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = currentMode === "register" ? "Creating Account…" : "Signing In…";

    try {
        if (currentMode === "register") {
            const name = document.getElementById("userName").value.trim();
            const college = document.getElementById("userCollege").value.trim();
            const degree = document.getElementById("userDegree").value.trim();
            const gradYear = document.getElementById("userGradYear").value.trim();

            if (!name || name.length < 2) {
                throw new Error("Please enter your full name.");
            }

            const res = await apiFetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, college, degree, gradYear }),
            });

            setAuth(res.token, res.user);
            showMessage("Account created! Redirecting to your dashboard…", false);

            setTimeout(() => {
                const redirectUrl = new URLSearchParams(window.location.search).get("redirect");
                window.location.href = redirectUrl || "dashboard.html";
            }, 500);
        } else {
            const res = await apiFetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            setAuth(res.token, res.user);
            showMessage("Welcome back! Redirecting…", false);

            setTimeout(() => {
                const redirectUrl = new URLSearchParams(window.location.search).get("redirect");
                window.location.href = redirectUrl || "dashboard.html";
            }, 500);
        }
    } catch (err) {
        showMessage(err.message || "Authentication failed. Please check your credentials.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
