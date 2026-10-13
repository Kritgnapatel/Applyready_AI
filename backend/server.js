
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { OAuth2Client } = require("google-auth-library");

const googleAuthClient = new OAuth2Client();

const app = express();
const PORT = process.env.PORT || 5000;

const ML_SERVICE_URL =
    process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

// ─── CORS & ENVIRONMENT ────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";

// Validate JWT_SECRET in production to prevent weak/example defaults
const JWT_SECRET = process.env.JWT_SECRET;
if (isProduction && JWT_SECRET) {
    const weakSecrets = new Set([
        "secret",
        "jwt_secret",
        "changeme",
        "123456",
        "applyready_jwt_secure_auth_token_key_2026",
    ]);
    if (weakSecrets.has(JWT_SECRET.toLowerCase()) || JWT_SECRET.length < 32) {
        console.warn(
            "⚠️ [SECURITY WARNING] The configured JWT_SECRET is an example or weak key (<32 chars). " +
            "Please provide a strong, randomly generated secret in your production environment variables."
        );
    }
}

const defaultDevOrigins = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "null",
];

const explicitOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

const trustedOrigins = new Set(
    isProduction ? explicitOrigins : [...explicitOrigins, ...defaultDevOrigins]
);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow same-origin requests or non-browser agents with no Origin header (curl, mobile apps)
            if (!origin) {
                return callback(null, true);
            }

            // In production: only allow explicitly configured trusted origins
            if (trustedOrigins.has(origin)) {
                return callback(null, true);
            }

            // In local development only: allow localhost / 127.0.0.1 ports
            if (!isProduction && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
                return callback(null, true);
            }

            return callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json({ limit: "1mb" }));

// ─── MONGOOSE (optional — graceful fallback) ────────────────────────────────────
let User = null;
let Application = null;
let Assessment = null;
let dbConnected = false;

// In-memory fallback stores for stateless or offline execution
const userStore = new Map();
const sessionStore = new Map();
const applicationsStore = [];
const assessmentsStore = [];

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !stored.includes(":")) return false;
    const [salt, originalHash] = stored.split(":");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === originalHash;
}

function createSession(user) {
    const token = `tok_${Date.now()}_${crypto.randomBytes(24).toString("hex")}`;
    const session = {
        userId: user.userId,
        email: user.email.toLowerCase(),
        name: user.name,
        avatar: user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
        college: user.college || "",
        degree: user.degree || "",
        gradYear: user.gradYear || "",
        authProvider: user.authProvider || "local",
        createdAt: user.createdAt || new Date(),
        expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 days
    };
    sessionStore.set(token, session);
    return token;
}

async function getAuthUser(req) {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }
    if (!token) return null;
    const session = sessionStore.get(token);
    if (!session || session.expiresAt < Date.now()) {
        sessionStore.delete(token);
        return null;
    }

    if (dbConnected && User) {
        try {
            const dbUser = await User.findOne({ userId: session.userId });
            if (dbUser) {
                return {
                    userId: dbUser.userId,
                    name: dbUser.name,
                    email: dbUser.email,
                    avatar: dbUser.avatar || session.avatar,
                    college: dbUser.college || "",
                    degree: dbUser.degree || "",
                    gradYear: dbUser.gradYear || "",
                    authProvider: dbUser.authProvider,
                    createdAt: dbUser.createdAt,
                    token,
                };
            }
        } catch {}
    }

    const memUser = userStore.get(session.email);
    if (memUser) {
        return {
            userId: memUser.userId,
            name: memUser.name,
            email: memUser.email,
            avatar: memUser.avatar || session.avatar,
            college: memUser.college || "",
            degree: memUser.degree || "",
            gradYear: memUser.gradYear || "",
            authProvider: memUser.authProvider,
            createdAt: memUser.createdAt,
            token,
        };
    }

    return { ...session, token };
}

async function requireAuth(req, res, next) {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({
            error: "Authentication required. Please sign in or register to access verification.",
            authRequired: true,
        });
    }
    req.user = user;
    next();
}

app.get("/api/auth/config", (req, res) => {
    res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    });
});

// Pre-seed demo user so user/tester can test directly
const defaultUser = {
    userId: "usr_demo_kritgna",
    name: "Kritgna Patel",
    email: "patelkritgna06@gmail.com",
    passwordHash: hashPassword("applyready123"),
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kritgna",
    college: "Indian Institute of Information Technology, Pune",
    degree: "B.Tech Electronics and Communication Engineering",
    gradYear: "2028",
    authProvider: "google",
    createdAt: new Date(),
};
userStore.set(defaultUser.email.toLowerCase(), defaultUser);

async function connectMongoDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.log("MONGODB_URI not set — running in stateless mode.");
        return;
    }
    try {
        const mongoose = require("mongoose");
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        dbConnected = true;
        console.log("MongoDB connected.");

        // ── Schemas ──
        const userSchema = new mongoose.Schema(
            {
                userId: { type: String, required: true, unique: true, index: true },
                name: { type: String, required: true },
                email: { type: String, required: true, unique: true, index: true, lowercase: true },
                passwordHash: { type: String, default: null },
                googleId: { type: String, default: null, index: true },
                avatar: { type: String, default: "" },
                college: { type: String, default: "" },
                degree: { type: String, default: "" },
                gradYear: { type: String, default: "" },
                authProvider: { type: String, default: "local" },
            },
            { timestamps: true }
        );

        const applicationSchema = new mongoose.Schema(
            {
                appId: { type: String, required: true, unique: true, index: true },
                userId: { type: String, index: true, default: null },
                domain: { type: String, enum: ["scholarship", "internship"], required: true },
                opportunityName: { type: String, required: true, maxlength: 200 },
                officialUrl: { type: String, default: "" },
                githubUrl: { type: String, default: "" },
                requirementsText: { type: String, default: "" },
                status: { type: String, default: "received" },
                filesMetadata: [
                    {
                        field: String,
                        originalName: String,
                        size: Number,
                        status: String,
                    },
                ],
            },
            { timestamps: true }
        );

        const assessmentSchema = new mongoose.Schema(
            {
                appId: { type: String, required: true, index: true },
                userId: { type: String, index: true, default: null },
                resumeExtraction: mongoose.Schema.Types.Mixed,
                requirementsPdfResult: mongoose.Schema.Types.Mixed,
                eligibilityResult: mongoose.Schema.Types.Mixed,
                documentComparisonResult: mongoose.Schema.Types.Mixed,
                classificationResult: mongoose.Schema.Types.Mixed,
                internshipAnalysis: mongoose.Schema.Types.Mixed,
                proofOfSkill: mongoose.Schema.Types.Mixed,
                documentIntegrity: mongoose.Schema.Types.Mixed,
                cvSuggestions: [mongoose.Schema.Types.Mixed],
                beforeAfterComparison: mongoose.Schema.Types.Mixed,
                originalCvText: { type: String, default: "" },
                acceptedRevisions: [mongoose.Schema.Types.Mixed],
                revisedCvText: { type: String, default: "" },
                genaiExplanation: mongoose.Schema.Types.Mixed,
            },
            { timestamps: true }
        );

        mongoose.connection.on("disconnected", () => {
            console.warn("MongoDB connection disconnected.");
            dbConnected = false;
        });
        mongoose.connection.on("reconnected", () => {
            console.log("MongoDB connection restored.");
            dbConnected = true;
        });
        mongoose.connection.on("error", (connErr) => {
            console.error("MongoDB runtime connection error:", connErr.message);
        });

        User = mongoose.models.User || mongoose.model("User", userSchema);
        Application = mongoose.models.Application || mongoose.model("Application", applicationSchema);
        Assessment = mongoose.models.Assessment || mongoose.model("Assessment", assessmentSchema);
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        dbConnected = false;
    }
}

connectMongoDB();

// ─── STATIC FRONTEND SERVING ──────────────────────────────────────────────────
const candidateFrontendDirs = [
    path.join(__dirname, "..", "frontend"),
    path.join(__dirname, "frontend"),
    path.join(process.cwd(), "frontend"),
];
const frontendDir = candidateFrontendDirs.find((dir) => fs.existsSync(dir));
if (frontendDir) {
    app.use(express.static(frontendDir));
}

// ─── AUTHENTICATION ENDPOINTS ─────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password, college, degree, gradYear } = req.body;
        if (!name || typeof name !== "string" || name.trim().length < 2) {
            return res.status(400).json({ error: "Please provide a valid full name (at least 2 letters)." });
        }
        if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: "Please provide a valid email address." });
        }
        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters." });
        }

        const normEmail = email.trim().toLowerCase();

        if (dbConnected && User) {
            const existing = await User.findOne({ email: normEmail });
            if (existing) {
                return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
            }
        }
        if (userStore.has(normEmail)) {
            return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        }

        const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const pwdHash = hashPassword(password);
        const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}`;

        const newUser = {
            userId,
            name: name.trim(),
            email: normEmail,
            passwordHash: pwdHash,
            avatar,
            college: typeof college === "string" ? college.trim() : "",
            degree: typeof degree === "string" ? degree.trim() : "",
            gradYear: typeof gradYear === "string" ? gradYear.trim() : "",
            authProvider: "local",
            createdAt: new Date(),
        };

        if (dbConnected && User) {
            try {
                await User.create(newUser);
            } catch (err) {
                console.error("DB error saving user:", err.message);
            }
        }
        userStore.set(normEmail, newUser);

        const token = createSession(newUser);
        return res.status(201).json({
            status: "ok",
            message: "Account created successfully.",
            token,
            user: {
                userId: newUser.userId,
                name: newUser.name,
                email: newUser.email,
                avatar: newUser.avatar,
                college: newUser.college,
                degree: newUser.degree,
                gradYear: newUser.gradYear,
                authProvider: newUser.authProvider,
                createdAt: newUser.createdAt,
            },
        });
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }
        const normEmail = email.trim().toLowerCase();

        let user = null;
        if (dbConnected && User) {
            user = await User.findOne({ email: normEmail });
        }
        if (!user) {
            user = userStore.get(normEmail);
        }

        if (!user) {
            return res.status(401).json({ error: "No account found with this email. Please register." });
        }

        if (user.authProvider === "google" && !user.passwordHash) {
            return res.status(400).json({ error: "This account was registered using Google. Please click 'Sign in with Google'." });
        }

        if (!verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ error: "Incorrect password. Please try again." });
        }

        const token = createSession(user);
        return res.json({
            status: "ok",
            message: "Signed in successfully.",
            token,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                college: user.college,
                degree: user.degree,
                gradYear: user.gradYear,
                authProvider: user.authProvider,
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Login failed. Please try again." });
    }
});

async function verifyGoogleIdToken(token) {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) {
        throw new Error("GOOGLE_CLIENT_ID is not configured in server environment.");
    }

    // 1. Verify with official google-auth-library
    try {
        const ticket = await googleAuthClient.verifyIdToken({
            idToken: token,
            audience: audience,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            throw new Error("Google token payload does not contain an email address.");
        }
        if (payload.email_verified !== true && payload.email_verified !== "true") {
            throw new Error("Google account email is not verified.");
        }
        return {
            email: payload.email.trim().toLowerCase(),
            name: payload.name || payload.given_name || payload.email.split("@")[0],
            avatar: payload.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(payload.name || payload.email)}`,
            googleId: payload.sub,
        };
    } catch (libraryErr) {
        // Fallback: verify via Google's tokeninfo endpoint to ensure high availability
        try {
            const tokenInfoRes = await safeFetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
                { timeout: 8000 }
            );
            if (!tokenInfoRes.ok) {
                throw new Error(`Google token validation failed: ${libraryErr.message}`);
            }
            const payload = await tokenInfoRes.json();
            if (payload.aud !== audience) {
                throw new Error(`Token audience mismatch (expected: ${audience}, got: ${payload.aud})`);
            }
            if (!payload.email || (payload.email_verified !== "true" && payload.email_verified !== true)) {
                throw new Error("Google account does not have a verified email.");
            }
            return {
                email: payload.email.trim().toLowerCase(),
                name: payload.name || payload.given_name || payload.email.split("@")[0],
                avatar: payload.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(payload.name || payload.email)}`,
                googleId: payload.sub,
            };
        } catch (fbErr) {
            throw new Error(`Invalid Google ID token: ${libraryErr.message}`);
        }
    }
}

app.post("/api/auth/google", async (req, res) => {
    try {
        const { credential } = req.body;
        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).json({
                error: "Google Sign-In is not configured on the server. Please set GOOGLE_CLIENT_ID.",
            });
        }

        if (!credential || typeof credential !== "string") {
            return res.status(400).json({ error: "Google credential ID token is required." });
        }

        let verifiedUser;
        try {
            verifiedUser = await verifyGoogleIdToken(credential);
        } catch (vErr) {
            console.error("Google ID token verification failed:", vErr.message);
            return res.status(401).json({ error: vErr.message || "Invalid or expired Google authentication token." });
        }

        const verifiedEmail = verifiedUser.email;
        const userName = verifiedUser.name;
        const userAvatar = verifiedUser.avatar;
        const userGoogleId = verifiedUser.googleId;

        const normEmail = verifiedEmail;

        let user = null;
        if (dbConnected && User) {
            user = await User.findOne({ email: normEmail });
        }
        if (!user) {
            user = userStore.get(normEmail);
        }

        if (user) {
            user.googleId = userGoogleId || user.googleId;
            user.avatar = user.avatar || userAvatar;
            if (dbConnected && User) {
                await User.updateOne({ email: normEmail }, { $set: { googleId: user.googleId, avatar: user.avatar } });
            }
            userStore.set(normEmail, user);
        } else {
            const userId = `usr_goog_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
            user = {
                userId,
                name: userName,
                email: normEmail,
                passwordHash: null,
                googleId: userGoogleId,
                avatar: userAvatar,
                college: "",
                degree: "",
                gradYear: "",
                authProvider: "google",
                createdAt: new Date(),
            };
            if (dbConnected && User) {
                try {
                    await User.create(user);
                } catch (dbErr) {
                    console.error("Failed saving Google user to DB:", dbErr.message);
                }
            }
            userStore.set(normEmail, user);
        }

        const token = createSession(user);
        return res.json({
            status: "ok",
            message: "Google sign-in successful.",
            token,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                college: user.college || "",
                degree: user.degree || "",
                gradYear: user.gradYear || "",
                authProvider: "google",
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Google auth endpoint error:", err);
        return res.status(500).json({ error: "Google sign-in failed. Please try again." });
    }
});

app.get("/api/auth/me", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    let appCount = 0;
    if (dbConnected && Application) {
        try {
            appCount = await Application.countDocuments({ userId: user.userId });
        } catch {}
    } else {
        appCount = applicationsStore.filter(a => a.userId === user.userId || a.userId === "usr_demo_kritgna").length;
    }

    return res.json({
        status: "ok",
        user,
        stats: {
            totalApplications: appCount,
        },
    });
});

app.put("/api/auth/profile", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    const { name, college, degree, gradYear } = req.body;
    const updates = {};
    if (typeof name === "string" && name.trim().length >= 2) updates.name = name.trim();
    if (typeof college === "string") updates.college = college.trim();
    if (typeof degree === "string") updates.degree = degree.trim();
    if (typeof gradYear === "string") updates.gradYear = gradYear.trim();

    if (dbConnected && User) {
        try {
            await User.updateOne({ userId: user.userId }, { $set: updates });
        } catch {}
    }

    const normEmail = user.email.toLowerCase();
    const memUser = userStore.get(normEmail) || {};
    Object.assign(memUser, updates);
    userStore.set(normEmail, memUser);

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        const token = req.headers.authorization.slice(7).trim();
        const sess = sessionStore.get(token);
        if (sess) Object.assign(sess, updates);
    }

    return res.json({
        status: "ok",
        message: "Profile updated successfully.",
        user: { ...user, ...updates },
    });
});

app.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        sessionStore.delete(token);
    }
    return res.json({ status: "ok", message: "Signed out successfully." });
});

app.get("/api/auth/applications", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    let userApps = [];
    if (dbConnected && Application) {
        try {
            const apps = await Application.find({ userId: user.userId }).sort({ createdAt: -1 });
            const assessments = await Assessment.find({ appId: { $in: apps.map(a => a.appId) } });
            const assessMap = new Map(assessments.map(a => [a.appId, a]));

            userApps = apps.map(a => {
                const as = assessMap.get(a.appId);
                return {
                    id: a.appId,
                    domain: a.domain,
                    opportunityName: a.opportunityName,
                    officialUrl: a.officialUrl,
                    status: a.status,
                    createdAt: a.createdAt,
                    eligibilityStatus: as?.eligibilityResult?.status || "unknown",
                    extractedCgpa: as?.resumeExtraction?.fields?.cgpa ?? null,
                    comparisonStatus: as?.documentComparisonResult?.overall_status || null,
                };
            });
        } catch (err) {
            console.error("Error fetching user applications:", err);
        }
    } else {
        // In-memory applications
        userApps = applicationsStore
            .filter(a => a.userId === user.userId || (user.userId === "usr_demo_kritgna"))
            .map(a => ({
                id: a.id,
                domain: a.domain,
                opportunityName: a.opportunityName,
                officialUrl: a.officialUrl,
                status: a.status,
                createdAt: a.createdAt,
                eligibilityStatus: a.eligibilityStatus || "needs_review",
                extractedCgpa: a.extractedCgpa ?? null,
                comparisonStatus: a.comparisonStatus || null,
            }));
    }

    return res.json({ status: "ok", applications: userApps });
});

// ─── HEALTH & STATUS ──────────────────────────────────────────────────────────
app.get("/api", (req, res) => {
    res.json({ message: "Welcome to ApplyReady AI API", status: "online" });
});

app.get("/api/health", async (req, res) => {
    let mlStatus = "unknown";
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(`${ML_SERVICE_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        mlStatus = r.ok ? "ok" : `http_${r.status}`;
    } catch {
        mlStatus = "unavailable";
    }

    res.json({
        status: "OK",
        service: "ApplyReady AI Backend",
        db: dbConnected ? "connected" : (process.env.MONGODB_URI ? "disconnected" : "stateless"),
        mlService: mlStatus,
    });
});

// ─── APPLICATION CREATION ──────────────────────────────────────────────────────
app.post("/api/applications", requireAuth, async (req, res) => {
    const { domain, opportunityName, officialUrl, githubUrl, requirementsText } = req.body;

    const validDomains = ["scholarship", "internship"];
    if (!validDomains.includes(domain)) {
        return res.status(400).json({ error: "Select a valid application category (scholarship or internship)." });
    }

    if (
        typeof opportunityName !== "string" ||
        !opportunityName.trim() ||
        opportunityName.trim().length > 200
    ) {
        return res.status(400).json({
            error: "Opportunity name is required and must be under 200 characters.",
        });
    }

    if (typeof officialUrl !== "undefined" && typeof officialUrl !== "string") {
        return res.status(400).json({ error: "Official URL must be text." });
    }

    if (typeof githubUrl !== "undefined" && typeof githubUrl !== "string") {
        return res.status(400).json({ error: "GitHub URL must be text." });
    }

    if (typeof requirementsText !== "undefined" && typeof requirementsText !== "string") {
        return res.status(400).json({ error: "Requirements must be text." });
    }

    if (typeof requirementsText === "string" && requirementsText.length > 20000) {
        return res.status(400).json({ error: "Requirements text is too long." });
    }

    const userId = req.user.userId;
    const appId = `app_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const application = {
        id: appId,
        userId,
        domain,
        opportunityName: opportunityName.trim(),
        officialUrl: typeof officialUrl === "string" ? officialUrl.trim() : "",
        githubUrl: typeof githubUrl === "string" ? githubUrl.trim() : "",
        requirementsText: typeof requirementsText === "string" ? requirementsText.trim() : "",
        status: "received",
        createdAt: new Date(),
    };
    applicationsStore.unshift(application);

    // Persist if DB available
    if (dbConnected && Application) {
        try {
            await Application.create({
                appId,
                userId,
                domain: application.domain,
                opportunityName: application.opportunityName,
                officialUrl: application.officialUrl,
                githubUrl: application.githubUrl,
                requirementsText: application.requirementsText,
            });
        } catch (err) {
            console.error("DB save failed (application):", err.message);
        }
    }

    console.log("Application received for user:", userId, "appId:", appId);
    return res.status(201).json({
        message: "Application details received successfully.",
        application,
    });
});

// ─── LIST RECENT APPLICATIONS ─────────────────────────────────────────────────
app.get("/api/applications", requireAuth, async (req, res) => {
    const userId = req.user.userId;
    if (!dbConnected || !Application) {
        const userApps = applicationsStore
            .filter((a) => a.userId === userId || a.userId === "usr_demo_kritgna")
            .slice(0, 20);
        return res.json({ applications: userApps, note: "Database not connected — stateless mode." });
    }
    try {
        const apps = await Application.find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .select("appId domain opportunityName status createdAt");
        return res.json({
            applications: apps.map((a) => ({
                id: a.appId,
                domain: a.domain,
                opportunityName: a.opportunityName,
                status: a.status,
                createdAt: a.createdAt,
            })),
        });
    } catch (err) {
        return res.status(500).json({ error: "Could not retrieve applications." });
    }
});

// ─── UPLOADS ───────────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "private-uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const allowedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 4 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
            return cb(new Error("Only PDF, PNG and JPG files are allowed."));
        }
        cb(null, true);
    },
});

// ─── SAFE FETCH HELPER ────────────────────────────────────────────────────────
async function safeFetch(url, options = {}) {
    const parsed = new URL(url);

    // Block non-HTTP protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
    }

    // Block private/internal IP ranges and localhost
    const hostname = parsed.hostname.toLowerCase();
    const privatePatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^::1$/,
        /^0\.0\.0\.0$/,
        /^169\.254\./,
    ];
    for (const pattern of privatePatterns) {
        if (pattern.test(hostname)) {
            throw new Error("URL points to a private or internal address.");
        }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeout || 10000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: ctrl.signal,
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
                "Accept-Language": "en-US,en;q=0.9",
                ...(options.headers || {}),
            },
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

// ─── URL REQUIREMENTS FETCH ───────────────────────────────────────────────────
app.post("/api/fetch-url-requirements", requireAuth, async (req, res) => {
    let rawUrl = (req.body?.url || "").trim();

    if (!rawUrl) {
        return res.status(400).json({ error: "A URL is required." });
    }

    // Auto-prepend https:// if protocol was omitted
    if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = "https://" + rawUrl;
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return res.status(400).json({ error: "Invalid URL format. Please provide a valid web address (e.g. https://example.com)." });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS URLs are supported." });
    }

    try {
        const response = await safeFetch(parsed.href, { timeout: 12000 });

        if (!response.ok) {
            return res.status(422).json({
                status: "fetch_failed",
                message: `This website returned HTTP ${response.status} (anti-bot protection or restricted). You can copy and paste the eligibility text directly into the requirements field.`,
                url: parsed.href,
            });
        }

        const rawText = await response.text();

        // Extract title
        const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

        // Extract meta description
        const metaDescMatch = rawText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                              rawText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                              rawText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        const metaDesc = metaDescMatch ? metaDescMatch[1].replace(/\s+/g, " ").trim() : "";

        // Strip non-content and layout tags
        let cleanHtml = rawText
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
            .replace(/<header[\s\S]*?<\/header>/gi, " ")
            .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
            .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
            .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

        // Strip remaining HTML tags and decode common entities
        let text = cleanHtml
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\s+/g, " ")
            .trim();

        if (!text || text.length < 30) {
            return res.status(422).json({
                status: "no_content",
                message: "This page rendered dynamically via client-side JavaScript or contains no text. Please enter the requirements manually.",
                url: parsed.href,
            });
        }

        // Filter for sentences / paragraphs with opportunity keywords
        const paragraphs = text.split(/(?<=[.!?])\s+/);
        const RELEVANT_KEYWORDS = [
            "cgpa", "gpa", "eligib", "criteria", "requirement", "qualificat", "degree",
            "b.tech", "b.e", "bachelor", "master", "stipend", "deadline", "intern",
            "scholarship", "batch of", "graduat", "percentage", "passout", "applicant"
        ];
        const relevantLines = paragraphs.filter(p => {
            const low = p.toLowerCase();
            return RELEVANT_KEYWORDS.some(k => low.includes(k));
        });

        const extractionCorpus = [
            pageTitle ? `Opportunity Title: ${pageTitle}` : "",
            metaDesc ? `Description: ${metaDesc}` : "",
            relevantLines.slice(0, 15).join(" "),
            text.slice(0, 4000),
        ].filter(Boolean).join("\n\n");

        // Forward to ML service for requirements extraction
        let extracted = null;
        try {
            const mlResponse = await fetch(`${ML_SERVICE_URL}/extract-requirements`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: extractionCorpus }),
                signal: AbortSignal.timeout(10000),
            });
            if (mlResponse.ok) {
                extracted = await mlResponse.json();
            }
        } catch (mlErr) {
            console.error("ML requirements extraction error:", mlErr.message);
        }

        const summaryText = [
            pageTitle ? `Title: ${pageTitle}` : "",
            metaDesc ? `Overview: ${metaDesc}` : "",
            relevantLines.length > 0 ? "Eligibility Highlights: " + relevantLines.slice(0, 5).join(" ") : text.slice(0, 400),
        ].filter(Boolean).join("\n\n");

        return res.json({
            status: "ok",
            url: parsed.href,
            pageTitle,
            extractedText: summaryText,
            requirements: extracted,
        });
    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({
                status: "timeout",
                message: "The URL took too long to respond. Use manual text entry instead.",
            });
        }
        return res.status(422).json({
            status: "fetch_error",
            message: err.message || "Could not fetch URL. Use manual text entry instead.",
        });
    }
});

// ─── DOCUMENT UPLOAD + ASSESSMENT ─────────────────────────────────────────────
async function runAssessment(req) {
    let requirementsText =
        typeof req.body?.requirementsText === "string"
            ? req.body.requirementsText.trim()
            : "";

    if (!requirementsText && req.params?.id && dbConnected && Application) {
        try {
            const existingApp = await Application.findOne({ appId: req.params.id }).select("requirementsText");
            if (existingApp?.requirementsText) {
                requirementsText = existingApp.requirementsText.trim();
            }
        } catch {
            // non-fatal lookup fallback
        }
    }

    let appRecord = null;
    if (req.params?.id) {
        if (dbConnected && Application) {
            try {
                appRecord = await Application.findOne({ appId: req.params.id });
            } catch {}
        }
        if (!appRecord) {
            appRecord = applicationsStore.find((a) => a.id === req.params.id);
        }
    }
    const domain = appRecord?.domain || req.body?.domain || "scholarship";
    const opportunityName = appRecord?.opportunityName || req.body?.opportunityName || "Opportunity";
    const githubUrl = req.body?.githubUrl || appRecord?.githubUrl || "";

    let resumeExtraction = null;
    let requirementsPdfResult = null;
    let eligibilityResult = null;
    let documentComparisonResult = null;
    let classificationResult = null;
    let internshipAnalysis = null;
    let proofOfSkill = null;
    let documentIntegrity = null;

    const files = Object.entries(req.files || {}).flatMap(([field, uploadedFiles]) =>
        uploadedFiles.map((file) => ({
            field,
            originalName: file.originalname,
            size: file.size,
            status: "uploaded",
        }))
    );

    // 1. Extract requirements from uploaded PDF
    const requirementsPdfFile = req.files?.requirementsFile?.[0];
    if (
        requirementsPdfFile &&
        path.extname(requirementsPdfFile.originalname).toLowerCase() === ".pdf"
    ) {
        try {
            const pdfBuffer = await fs.promises.readFile(requirementsPdfFile.path);
            const pdfFormData = new FormData();
            pdfFormData.append(
                "file",
                new Blob([pdfBuffer], { type: "application/pdf" }),
                requirementsPdfFile.originalname
            );
            const pdfResponse = await fetch(`${ML_SERVICE_URL}/extract-requirements-pdf`, {
                method: "POST",
                body: pdfFormData,
                signal: AbortSignal.timeout(15000),
            });
            if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}`);
            requirementsPdfResult = await pdfResponse.json();
        } catch (error) {
            console.error("Requirements PDF extraction failed:", error.message);
            requirementsPdfResult = {
                status: "needs_review",
                minimum_cgpa: null,
                evidence: null,
                message: "Requirements PDF could not be processed.",
            };
        }
    }

    // 2. Extract resume fields + classification + document integrity
    const resumeFile = req.files?.resume?.[0];
    const resumeIsPdf =
        resumeFile && path.extname(resumeFile.originalname).toLowerCase() === ".pdf";

    if (resumeIsPdf) {
        try {
            const pdfBuffer = await fs.promises.readFile(resumeFile.path);
            const formData = new FormData();
            formData.append(
                "file",
                new Blob([pdfBuffer], { type: "application/pdf" }),
                resumeFile.originalname
            );

            const [extractionResponse, classifyResponse, integrityResponse] = await Promise.allSettled([
                fetch(`${ML_SERVICE_URL}/extract-fields`, {
                    method: "POST",
                    body: formData,
                    signal: AbortSignal.timeout(15000),
                }),
                (() => {
                    const fd2 = new FormData();
                    fd2.append(
                        "file",
                        new Blob([pdfBuffer], { type: "application/pdf" }),
                        resumeFile.originalname
                    );
                    return fetch(`${ML_SERVICE_URL}/classify-document`, {
                        method: "POST",
                        body: fd2,
                        signal: AbortSignal.timeout(10000),
                    });
                })(),
                (() => {
                    const fd3 = new FormData();
                    fd3.append(
                        "file",
                        new Blob([pdfBuffer], { type: "application/pdf" }),
                        resumeFile.originalname
                    );
                    return fetch(`${ML_SERVICE_URL}/analyze-integrity`, {
                        method: "POST",
                        body: fd3,
                        signal: AbortSignal.timeout(10000),
                    });
                })(),
            ]);

            if (extractionResponse.status === "fulfilled" && extractionResponse.value.ok) {
                resumeExtraction = await extractionResponse.value.json();
                resumeExtraction.status = "completed";
            } else {
                throw new Error("Extraction service failed.");
            }

            if (classifyResponse.status === "fulfilled" && classifyResponse.value.ok) {
                classificationResult = await classifyResponse.value.json();
            }

            if (integrityResponse.status === "fulfilled" && integrityResponse.value.ok) {
                documentIntegrity = await integrityResponse.value.json();
            }

            const extractedCgpa = resumeExtraction?.fields?.cgpa ?? null;

            // 3. Extract CGPA requirement from manual text
            let minimumCgpa = null;
            let requirementSource = null;
            let requirementEvidence = null;
            let requirementCriteria = null;

            if (requirementsText) {
                try {
                    const requirementsResponse = await fetch(
                        `${ML_SERVICE_URL}/extract-requirements`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: requirementsText }),
                            signal: AbortSignal.timeout(10000),
                        }
                    );
                    if (!requirementsResponse.ok) throw new Error(`HTTP ${requirementsResponse.status}`);
                    const extractedRequirements = await requirementsResponse.json();
                    requirementCriteria = extractedRequirements.criteria || null;

                    if (
                        extractedRequirements.status === "extracted" &&
                        extractedRequirements.minimum_cgpa != null
                    ) {
                        minimumCgpa = extractedRequirements.minimum_cgpa;
                        requirementSource = "manual_text";
                        requirementEvidence = extractedRequirements.evidence ?? null;
                    }
                } catch (error) {
                    console.error("Manual requirements extraction failed:", error.message);
                }
            }

            // 4. Fall back to PDF requirements
            if (
                minimumCgpa === null &&
                requirementsPdfResult?.status === "extracted" &&
                requirementsPdfResult.minimum_cgpa != null
            ) {
                minimumCgpa = requirementsPdfResult.minimum_cgpa;
                requirementSource = "requirements_pdf";
                requirementEvidence = requirementsPdfResult.evidence ?? null;
            }

            // 5. Eligibility check
            try {
                const eligibilityResponse = await fetch(`${ML_SERVICE_URL}/check-eligibility`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        extracted_cgpa: extractedCgpa,
                        minimum_cgpa: minimumCgpa,
                        extracted_graduation_year: resumeExtraction?.fields?.graduation_year ?? null,
                        extracted_fields: resumeExtraction?.fields ?? {},
                        requirement_criteria: requirementCriteria,
                    }),
                    signal: AbortSignal.timeout(10000),
                });
                if (!eligibilityResponse.ok) throw new Error(`HTTP ${eligibilityResponse.status}`);
                eligibilityResult = await eligibilityResponse.json();
                eligibilityResult.requirement_source = requirementSource;
                eligibilityResult.requirement_evidence = requirementEvidence;
            } catch (error) {
                console.error("Eligibility check failed:", error.message);
                eligibilityResult = {
                    status: "needs_review",
                    reason: "Eligibility verification could not be completed.",
                    requirement_source: requirementSource,
                    requirement_evidence: requirementEvidence,
                };
            }
        } catch (error) {
            console.error("Resume extraction failed:", error.message);
            resumeExtraction = {
                status: "failed",
                message: "Resume uploaded, but field extraction failed.",
            };
            eligibilityResult = {
                status: "needs_review",
                reason: "CGPA could not be extracted or verified.",
            };
        }
    } else {
        eligibilityResult = {
            status: "needs_review",
            reason: "A resume PDF is required for CGPA verification.",
        };
    }

    // 6. Compare resume and marksheet
    const resumeForComparison = req.files?.resume?.[0];
    const marksheetForComparison = req.files?.marksheet?.[0];
    const areBothPdfs =
        resumeForComparison &&
        marksheetForComparison &&
        path.extname(resumeForComparison.originalname).toLowerCase() === ".pdf" &&
        path.extname(marksheetForComparison.originalname).toLowerCase() === ".pdf";

    if (areBothPdfs) {
        try {
            const [resumeBuffer, marksheetBuffer] = await Promise.all([
                fs.promises.readFile(resumeForComparison.path),
                fs.promises.readFile(marksheetForComparison.path),
            ]);
            const comparisonForm = new FormData();
            comparisonForm.append(
                "resume",
                new Blob([resumeBuffer], { type: "application/pdf" }),
                resumeForComparison.originalname
            );
            comparisonForm.append(
                "marksheet",
                new Blob([marksheetBuffer], { type: "application/pdf" }),
                marksheetForComparison.originalname
            );
            const comparisonResponse = await fetch(`${ML_SERVICE_URL}/compare-documents`, {
                method: "POST",
                body: comparisonForm,
                signal: AbortSignal.timeout(20000),
            });
            if (!comparisonResponse.ok) throw new Error(`HTTP ${comparisonResponse.status}`);
            documentComparisonResult = await comparisonResponse.json();
        } catch (error) {
            console.error("Document comparison failed:", error.message);
            documentComparisonResult = {
                status: "needs_review",
                message: "Document comparison could not be completed.",
            };
        }
    } else {
        documentComparisonResult = {
            status: "needs_review",
            message: "Upload both resume and marksheet as PDFs to compare them.",
        };
    }

    // 7. Domain-specific Internship Intelligence
    if (domain === "internship") {
        try {
            const jdText = requirementsText || requirementsPdfResult?.extractedText || requirementsPdfResult?.text || opportunityName;
            const cvText = resumeExtraction?.raw_text || resumeExtraction?.text || "";

            const internResponse = await fetch(`${ML_SERVICE_URL}/analyze-internship`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jd_text: jdText,
                    cv_text: cvText,
                    opportunity_name: opportunityName,
                }),
                signal: AbortSignal.timeout(15000),
            });

            if (internResponse.ok) {
                internshipAnalysis = await internResponse.json();
            }
        } catch (internErr) {
            console.error("Internship analysis error:", internErr.message);
        }

        // 8. Proof of Skill (GitHub)
        if (githubUrl) {
            try {
                let claimedSkills = internshipAnalysis?.skills_matrix
                    ?.filter((s) => s.status !== "missing")
                    ?.map((s) => s.skill);

                if (!claimedSkills || claimedSkills.length === 0) {
                    claimedSkills = internshipAnalysis?.skills_matrix?.map((s) => s.skill);
                }
                if (!claimedSkills || claimedSkills.length === 0) {
                    claimedSkills = ["javascript", "python", "git"];
                }

                const proofResponse = await fetch(`${ML_SERVICE_URL}/verify-skills`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        github_url: githubUrl,
                        claimed_skills: claimedSkills,
                    }),
                    signal: AbortSignal.timeout(12000),
                });

                if (proofResponse.ok) {
                    proofOfSkill = await proofResponse.json();
                    if (internshipAnalysis && proofOfSkill && Array.isArray(proofOfSkill.verified_skills)) {
                        const verifiedMap = new Map();
                        proofOfSkill.verified_skills.forEach(v => {
                            if (v.status === "evidence_found") {
                                verifiedMap.set((v.skill || "").toLowerCase().trim(), v);
                            }
                        });
                        if (Array.isArray(internshipAnalysis.skills_matrix)) {
                            internshipAnalysis.skills_matrix.forEach(s => {
                                const skillKey = (s.skill || "").toLowerCase().trim();
                                if (verifiedMap.has(skillKey)) {
                                    s.status = "verified by repository";
                                    s.repository_verified = true;
                                    const vMatch = verifiedMap.get(skillKey);
                                    if (vMatch && vMatch.file_path) {
                                        s.evidence = `Verified in repository manifest [File: ${vMatch.file_path}]. ${s.evidence || ""}`.trim();
                                    }
                                }
                            });
                        }
                    }
                } else {
                    proofOfSkill = {
                        status: "unable_to_verify",
                        repository: githubUrl,
                        message: `Proof-of-Skill inspection returned HTTP ${proofResponse.status}.`,
                        verified_skills: [],
                        inspected_files: [],
                        manifests_analyzed: [],
                        detected_languages: [],
                        evidence_breakdown: { implementation_count: 0, dependency_count: 0, test_count: 0, infrastructure_count: 0 },
                        note: "Unable to verify repository at this time.",
                    };
                }
            } catch (proofErr) {
                console.error("Proof of skill error:", proofErr.message);
                proofOfSkill = {
                    status: "unable_to_verify",
                    repository: githubUrl,
                    message: "Proof-of-Skill inspection error: " + proofErr.message,
                    verified_skills: [],
                    inspected_files: [],
                    manifests_analyzed: [],
                    detected_languages: [],
                    evidence_breakdown: { implementation_count: 0, dependency_count: 0, test_count: 0, infrastructure_count: 0 },
                    note: "Unable to verify repository.",
                };
            }
        } else {
            proofOfSkill = {
                status: "not_run",
                repository: null,
                message: "No GitHub repository URL provided. Code verification was Not Run; no repository claims are verified.",
                verified_skills: [],
                inspected_files: [],
                manifests_analyzed: [],
                detected_languages: [],
                evidence_breakdown: { implementation_count: 0, dependency_count: 0, test_count: 0, infrastructure_count: 0 },
                note: "Proof-of-Skill was not run for this application.",
            };
        }
    }

    const rawCvText = resumeExtraction?.raw_text || resumeExtraction?.text || "";

    // Clean up temporary disk files safely (ephemeral container storage)
    if (req.files) {
        for (const fileGroup of Object.values(req.files)) {
            if (Array.isArray(fileGroup)) {
                for (const f of fileGroup) {
                    if (f && f.path) {
                        fs.promises.unlink(f.path).catch(() => {});
                    }
                }
            }
        }
    }

    return {
        files,
        domain,
        resumeExtraction,
        requirementsPdfResult,
        eligibilityResult,
        documentComparisonResult,
        classificationResult,
        internshipAnalysis,
        proofOfSkill,
        documentIntegrity,
        cvSuggestions: internshipAnalysis?.suggestions || [],
        originalCvText: rawCvText,
        acceptedRevisions: [],
        revisedCvText: rawCvText,
    };
}

app.post(
    "/api/applications/:id/documents",
    requireAuth,
    upload.fields([
        { name: "resume", maxCount: 1 },
        { name: "marksheet", maxCount: 1 },
        { name: "certificate", maxCount: 1 },
        { name: "requirementsFile", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const result = await runAssessment(req);

            // Persist assessment
            const appId = req.params.id;
            const userId = req.user.userId;
            if (dbConnected && Assessment) {
                try {
                    await Assessment.create({ appId, userId, ...result });
                    // Update application status
                    if (Application) {
                        await Application.updateOne(
                            { appId },
                            { status: "assessed", filesMetadata: result.files }
                        );
                    }
                } catch (err) {
                    console.error("DB save failed (assessment):", err.message);
                }
            }

            assessmentsStore.unshift({ appId, userId, ...result });

            const memApp = applicationsStore.find(a => a.id === appId);
            if (memApp) {
                memApp.status = "assessed";
                memApp.eligibilityStatus = result.eligibilityResult?.status || "unknown";
                memApp.extractedCgpa = result.resumeExtraction?.fields?.cgpa ?? null;
                memApp.comparisonStatus = result.documentComparisonResult?.overall_status || null;
            }

            return res.status(201).json({
                message: "Documents uploaded and assessed successfully.",
                applicationId: appId,
                ...result,
            });
        } catch (err) {
            console.error("Assessment error:", err);
            return res.status(500).json({ error: "Assessment failed. Please try again." });
        }
    }
);

// ─── REASSESSMENT ─────────────────────────────────────────────────────────────
app.post(
    "/api/applications/:id/reassess",
    requireAuth,
    upload.fields([
        { name: "resume", maxCount: 1 },
        { name: "marksheet", maxCount: 1 },
        { name: "certificate", maxCount: 1 },
        { name: "requirementsFile", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const result = await runAssessment(req);
            const appId = req.params.id;
            const userId = req.user.userId;

            if (dbConnected && Assessment) {
                try {
                    await Assessment.create({ appId, userId, ...result });
                } catch (err) {
                    console.error("DB save failed (reassessment):", err.message);
                }
            }

            return res.json({
                message: "Reassessment completed.",
                applicationId: appId,
                ...result,
            });
        } catch (err) {
            console.error("Reassessment error:", err);
            return res.status(500).json({ error: "Reassessment failed. Please try again." });
        }
    }
);

// ─── ASSESSMENT HISTORY ───────────────────────────────────────────────────────
app.get("/api/applications/:id/history", requireAuth, async (req, res) => {
    if (!dbConnected || !Assessment) {
        return res.json({ history: [], note: "Database not connected." });
    }
    try {
        const history = await Assessment.find({ appId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select("eligibilityResult documentComparisonResult createdAt");
        return res.json({ history });
    } catch {
        return res.status(500).json({ error: "Could not retrieve history." });
    }
});

// ─── GET SINGLE APPLICATION WITH LATEST ASSESSMENT ────────────────────────────
app.get("/api/applications/:id", requireAuth, async (req, res) => {
    const appId = req.params.id;
    if (dbConnected && Application) {
        try {
            const application = await Application.findOne({ appId });
            if (!application) {
                return res.status(404).json({ error: "Application not found." });
            }
            let latestAssessment = null;
            if (Assessment) {
                latestAssessment = await Assessment.findOne({ appId }).sort({ createdAt: -1 });
            }
            return res.json({
                application,
                latestAssessment,
            });
        } catch (err) {
            return res.status(500).json({ error: "Failed to retrieve application." });
        }
    } else {
        const memApp = applicationsStore.find(a => a.id === appId);
        if (!memApp) {
            return res.status(404).json({ error: "Application not found." });
        }
        const memAssess = assessmentsStore.find(a => a.appId === appId) || null;
        return res.json({
            application: memApp,
            latestAssessment: memAssess,
        });
    }
});

// ─── CV IMPROVEMENT LAB: ACCEPT/REJECT SUGGESTION ───────────────────────────
app.patch("/api/applications/:id/cv-suggestions/:sugId", requireAuth, async (req, res) => {
    const { id, sugId } = req.params;
    const { status } = req.body;
    if (!["accepted", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'accepted', 'rejected', or 'pending'." });
    }

    if (dbConnected && Assessment) {
        try {
            const assess = await Assessment.findOne({ appId: id }).sort({ createdAt: -1 });
            if (assess && assess.cvSuggestions) {
                const sug = assess.cvSuggestions.find((s) => s.id === sugId);
                if (sug) {
                    sug.status = status;
                    assess.markModified("cvSuggestions");
                    await assess.save();
                    return res.json({ status: "ok", sugId, newStatus: status, suggestion: sug });
                }
            }
        } catch (err) {
            console.error("Error updating suggestion status:", err);
            return res.status(500).json({ error: "Failed to update suggestion." });
        }
    } else {
        const memAssess = assessmentsStore.find(a => a.appId === id);
        if (memAssess && memAssess.cvSuggestions) {
            const sug = memAssess.cvSuggestions.find(s => s.id === sugId);
            if (sug) {
                sug.status = status;
                return res.json({ status: "ok", sugId, newStatus: status, suggestion: sug });
            }
        }
    }

    return res.json({ status: "ok", sugId, newStatus: status });
});

// ─── CV IMPROVEMENT LAB: RERUN ANALYSIS WITH ACCEPTED BULLETS ────────────────
app.post("/api/applications/:id/rerun-cv-analysis", requireAuth, async (req, res) => {
    const { id } = req.params;
    let assess = null;
    let appRecord = null;

    if (dbConnected && Assessment) {
        try {
            assess = await Assessment.findOne({ appId: id }).sort({ createdAt: -1 });
            if (Application) {
                appRecord = await Application.findOne({ appId: id });
            }
        } catch (e) {
            console.error("DB error in rerun-cv-analysis:", e.message);
        }
    }

    if (!assess) {
        assess = assessmentsStore.find(a => a.appId === id) || null;
    }

    if (!appRecord) {
        appRecord = applicationsStore.find(a => a.id === id);
    }

    // Retrieve accepted suggestions from request body or stored assessment
    const clientSuggestions = req.body?.acceptedSuggestions || [];
    let storedSuggestions = assess?.cvSuggestions || [];
    let accepted = clientSuggestions.length > 0 
        ? clientSuggestions.filter(s => s.status === "accepted")
        : storedSuggestions.filter(s => s.status === "accepted");

    if (accepted.length === 0) {
        return res.status(400).json({ error: "No accepted suggestions found to rerun analysis. Please accept at least one suggestion." });
    }

    // Base CV text
    let originalCvText = assess?.resumeExtraction?.raw_text || assess?.resumeExtraction?.text || req.body?.cvText || "";
    // Build revised CV text incorporating accepted bullets
    const bulletAdditions = accepted.map(s => `• ${s.suggested_bullet}`).join("\n");
    const revisedCvText = `${originalCvText}\n\n[OPTIMIZED PROJECT EXPERIENCE]\n${bulletAdditions}`;

    const jdText = req.body?.jdText || assess?.requirementsPdfResult?.extractedText || appRecord?.requirementsText || "";
    const opportunityName = req.body?.opportunityName || appRecord?.opportunityName || "Opportunity";

    try {
        const internResponse = await fetch(`${ML_SERVICE_URL}/analyze-internship`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jd_text: jdText,
                cv_text: revisedCvText,
                opportunity_name: opportunityName,
                proof_of_skill: assess?.proofOfSkill || null,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!internResponse.ok) {
            throw new Error(`ML service returned HTTP ${internResponse.status}`);
        }

        const revisedAnalysis = await internResponse.json();

        // Calculate before & after metrics
        const beforeIndex = assess?.internshipAnalysis?.alignment_index || req.body?.beforeAlignmentIndex || 0;
        const afterIndex = revisedAnalysis.alignment_index || 0;
        const beforeEvidence = assess?.internshipAnalysis?.dimensions?.experience_evidence_score?.percentage || req.body?.beforeEvidenceScore || 0;
        const afterEvidence = revisedAnalysis.dimensions?.experience_evidence_score?.percentage || 0;

        const isEvGrounded = s => s.status === "demonstrated" || s.status === "supported by project evidence" || s.status === "verified by repository";

        const beforeDemonstrated = new Set(
            (assess?.internshipAnalysis?.skills_matrix || [])
                .filter(isEvGrounded)
                .map(s => s.skill)
        );
        const afterDemonstrated = (revisedAnalysis.skills_matrix || [])
            .filter(s => isEvGrounded(s) && !beforeDemonstrated.has(s.skill))
            .map(s => s.skill);

        const beforeAfterComparison = {
            before_alignment_index: beforeIndex,
            after_alignment_index: afterIndex,
            delta_alignment: +(afterIndex - beforeIndex).toFixed(1),
            before_evidence_score: beforeEvidence,
            after_evidence_score: afterEvidence,
            delta_evidence: +(afterEvidence - beforeEvidence).toFixed(1),
            upgraded_skills: afterDemonstrated,
            accepted_bullets_count: accepted.length,
            rerun_at: new Date().toISOString(),
        };

        if (dbConnected && assess) {
            try {
                assess.internshipAnalysis = revisedAnalysis;
                assess.beforeAfterComparison = beforeAfterComparison;
                assess.originalCvText = originalCvText;
                assess.acceptedRevisions = accepted;
                assess.revisedCvText = revisedCvText;
                assess.markModified("internshipAnalysis");
                assess.markModified("beforeAfterComparison");
                assess.markModified("acceptedRevisions");
                await assess.save();
            } catch (saveErr) {
                console.error("Failed to save updated assessment:", saveErr.message);
            }
        }

        return res.json({
            status: "ok",
            message: "CV analysis rerun successfully with accepted bullets.",
            internshipAnalysis: revisedAnalysis,
            beforeAfterComparison,
            acceptedSuggestionsCount: accepted.length,
            originalCvText,
            acceptedRevisions: accepted,
            revisedCvText,
        });
    } catch (err) {
        console.error("Rerun CV analysis failed:", err);
        return res.status(500).json({ error: "Failed to rerun CV analysis: " + err.message });
    }
});

// ─── GENAI EXPLANATION PROXY ──────────────────────────────────────────────────

app.post("/api/genai-explain", requireAuth, async (req, res) => {
    try {
        const mlResponse = await fetch(`${ML_SERVICE_URL}/genai-explain`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(25000),
        });

        const data = await mlResponse.json().catch(() => ({
            available: false,
            text: null,
            method: "invalid_response",
            note: "ML service returned invalid JSON."
        }));

        if (!mlResponse.ok) {
            return res.status(mlResponse.status).json(data);
        }

        // If applicationId provided and DB connected, persist GenAI explanation
        const appId = req.body?.applicationId || req.body?.appId;
        if (appId && dbConnected && Assessment && data?.text) {
            try {
                await Assessment.findOneAndUpdate(
                    { appId },
                    { $set: { genaiExplanation: data } },
                    { sort: { createdAt: -1 } }
                );
            } catch (dbErr) {
                console.error("Failed to persist genaiExplanation:", dbErr.message);
            }
        }

        return res.json(data);
    } catch (err) {
        return res.status(502).json({
            available: false,
            text: null,
            method: "proxy_error",
            note: "ML GenAI service unavailable: " + (err.name === "AbortError" ? "Request timed out" : err.message)
        });
    }
});

// ─── ERROR HANDLERS ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return res.status(status).json({
            error:
                err.code === "LIMIT_FILE_SIZE"
                    ? "Each file must be 5 MB or smaller."
                    : err.message,
        });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

app.listen(PORT, () => {
    console.log(`ApplyReady AI server running at http://localhost:${PORT}`);
});
