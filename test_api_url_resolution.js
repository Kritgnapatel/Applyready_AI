/**
 * ApplyReady AI — Regression Test: Frontend API Base URL Resolution
 *
 * Verifies that:
 * 1. Deployed production environments (e.g. https://applyready-web-1d6b.onrender.com)
 *    strictly resolve to relative same-origin API paths (/api/...) and NEVER call localhost.
 * 2. Custom production domains resolve to relative same-origin API paths.
 * 3. Local backend serving frontend on port 5000 uses same-origin relative paths.
 * 4. External local dev tools (Live Server :5500, Vite :3000) route to http://localhost:5000.
 * 5. Direct file:// previews route to http://localhost:5000.
 */

const assert = require("assert");
const { resolveApiBase } = require("./frontend/shared.js");

console.log("==================================================");
console.log("   APPLYREADY AI — FRONTEND API URL REGRESSION TEST");
console.log("==================================================");

let passCount = 0;
let failCount = 0;

function check(desc, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${desc}`);
        passCount++;
    } catch (err) {
        console.error(`❌ FAIL: ${desc} — ${err.message}`);
        failCount++;
    }
}

// 1. Production Render URL (The exact reported error case)
check("Deployed Render URL uses same-origin relative paths (empty base)", () => {
    const renderLocation = {
        protocol: "https:",
        hostname: "applyready-web-1d6b.onrender.com",
        port: "",
    };
    const base = resolveApiBase(renderLocation);
    assert.strictEqual(base, "", "API_BASE must be empty string in production");
    const googleLoginUrl = `${base}/api/auth/google`;
    assert.strictEqual(googleLoginUrl, "/api/auth/google");
    assert.ok(!googleLoginUrl.includes("localhost"), "Production URL must not contain localhost");
    assert.ok(!googleLoginUrl.includes("5000"), "Production URL must not contain port 5000");
});

// 2. Production Custom Domain
check("Custom production domain uses same-origin relative paths", () => {
    const customLocation = {
        protocol: "https:",
        hostname: "applyready.ai",
        port: "",
    };
    const base = resolveApiBase(customLocation);
    assert.strictEqual(base, "");
    const configUrl = `${base}/api/auth/config`;
    assert.strictEqual(configUrl, "/api/auth/config");
});

// 3. Any Subdomain on Render or cloud platform
check("Arbitrary deployed cloud subdomain uses same-origin relative paths", () => {
    const stagingLocation = {
        protocol: "https:",
        hostname: "staging-applyready.onrender.com",
        port: "",
    };
    const base = resolveApiBase(stagingLocation);
    assert.strictEqual(base, "");
    assert.strictEqual(`${base}/api/health`, "/api/health");
});

// 4. Localhost served directly by Node backend (port 5000)
check("Local Node backend on port 5000 uses same-origin relative paths", () => {
    const localBackendLoc = {
        protocol: "http:",
        hostname: "localhost",
        port: "5000",
    };
    const base = resolveApiBase(localBackendLoc);
    assert.strictEqual(base, "", "Same-origin relative paths should be used when served by backend on port 5000");
    assert.strictEqual(`${base}/api/auth/login`, "/api/auth/login");
});

// 5. 127.0.0.1 served directly by Node backend (port 5000)
check("127.0.0.1 on port 5000 uses same-origin relative paths", () => {
    const ipLoc = {
        protocol: "http:",
        hostname: "127.0.0.1",
        port: "5000",
    };
    const base = resolveApiBase(ipLoc);
    assert.strictEqual(base, "");
    assert.strictEqual(`${base}/api/auth/google`, "/api/auth/google");
});

// 6. Local Live Server preview (port 5500)
check("Local Live Server on port 5500 correctly targets local backend on port 5000", () => {
    const liveServerLoc = {
        protocol: "http:",
        hostname: "127.0.0.1",
        port: "5500",
    };
    const base = resolveApiBase(liveServerLoc);
    assert.strictEqual(base, "http://localhost:5000");
    assert.strictEqual(`${base}/api/auth/google`, "http://localhost:5000/api/auth/google");
});

// 7. Local Dev Server on port 3000
check("Local Dev Server on port 3000 correctly targets local backend on port 5000", () => {
    const devServerLoc = {
        protocol: "http:",
        hostname: "localhost",
        port: "3000",
    };
    const base = resolveApiBase(devServerLoc);
    assert.strictEqual(base, "http://localhost:5000");
});

// 8. Local filesystem preview (file:// protocol)
check("Local file:// preview correctly targets local backend on port 5000", () => {
    const fileLoc = {
        protocol: "file:",
        hostname: "",
        port: "",
    };
    const base = resolveApiBase(fileLoc);
    assert.strictEqual(base, "http://localhost:5000");
    assert.strictEqual(`${base}/api/auth/config`, "http://localhost:5000/api/auth/config");
});

// 9. Null or undefined location fallback
check("Missing or null location safely returns empty string", () => {
    assert.strictEqual(resolveApiBase(null), "");
    assert.strictEqual(resolveApiBase(undefined), "");
});

console.log("\n==================================================");
console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log("==================================================");

if (failCount > 0) {
    process.exit(1);
}
