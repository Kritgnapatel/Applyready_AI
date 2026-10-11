/**
 * Comprehensive Automated Test: Mandatory Authentication, Security Gates & Google Auth Integration
 */

const fs = require("fs");
const path = require("path");

async function testAll() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — MANDATORY AUTH & SECURITY TEST ");
    console.log("==================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(desc, condition) {
        if (condition) {
            console.log(`✅ PASS: ${desc}`);
            passCount++;
        } else {
            console.error(`❌ FAIL: ${desc}`);
            failCount++;
        }
    }

    const BASE = "http://localhost:5000";

    // ── Test 1: Unauthenticated application creation MUST be rejected with 401
    console.log("\n[1] Testing Strict Security Gates for Unauthenticated Requests...");
    const unauthAppRes = await fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "scholarship",
            opportunityName: "Unauthorized Test Grant",
            requirementsText: "Must have CGPA 8.0"
        })
    });
    assert("POST /api/applications without token returns HTTP 401", unauthAppRes.status === 401);
    const unauthAppJson = await unauthAppRes.json();
    assert("Response specifies authRequired: true", unauthAppJson.authRequired === true);

    // ── Test 2: Unauthenticated URL requirements fetch MUST be rejected with 401
    const unauthUrlRes = await fetch(`${BASE}/api/fetch-url-requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" })
    });
    assert("POST /api/fetch-url-requirements without token returns HTTP 401", unauthUrlRes.status === 401);

    // ── Test 3: Unauthenticated application list MUST be rejected with 401
    const unauthListRes = await fetch(`${BASE}/api/applications`);
    assert("GET /api/applications without token returns HTTP 401", unauthListRes.status === 401);

    // ── Test 4: Register a new student account
    console.log("\n[2] Testing Student Registration & Login...");
    const testEmail = `student_${Date.now()}@university.edu`;
    const regRes = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Test Applicant",
            email: testEmail,
            password: "password123",
            college: "National Institute of Technology",
            degree: "B.Tech Computer Science",
            gradYear: "2027"
        })
    });
    assert("POST /api/auth/register succeeds with HTTP 201", regRes.status === 201);
    const regData = await regRes.json();
    assert("Registration returns valid session token", !!regData.token);
    assert("Registration returns student profile with college & degree", regData.user?.college === "National Institute of Technology");
    const token = regData.token;

    // ── Test 5: Login with correct and incorrect password
    const badLoginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: "wrongpassword" })
    });
    assert("POST /api/auth/login with wrong password returns HTTP 401", badLoginRes.status === 401);

    const goodLoginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: "password123" })
    });
    assert("POST /api/auth/login with correct password succeeds HTTP 200", goodLoginRes.status === 200);

    // ── Test 6: Authenticated Application Creation
    console.log("\n[3] Testing Authenticated Application Verification Workflow...");
    const authAppRes = await fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            domain: "internship",
            opportunityName: "Google Summer Research Internship 2026",
            officialUrl: "https://careers.google.com/internships",
            requirementsText: "Eligibility: Minimum CGPA of 8.0, graduating in 2027 or 2028."
        })
    });
    assert("Authenticated POST /api/applications succeeds HTTP 201", authAppRes.status === 201);
    const appData = await authAppRes.json();
    const appId = appData.application.id;
    assert("Application has valid ID", !!appId);
    assert("Application is tied to user ID", appData.application.userId === regData.user.userId);

    // ── Test 7: Authenticated List Applications
    const listAppsRes = await fetch(`${BASE}/api/applications`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    assert("Authenticated GET /api/applications returns HTTP 200", listAppsRes.status === 200);
    const listData = await listAppsRes.json();
    assert("Applications list contains created opportunity", listData.applications.some(a => a.id === appId));

    // ── Test 8: Student Profile & Stats
    console.log("\n[4] Testing User Profile & Credential Management...");
    const meRes = await fetch(`${BASE}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    assert("GET /api/auth/me returns HTTP 200", meRes.status === 200);
    const meData = await meRes.json();
    assert("Profile matches registered student", meData.user?.email === testEmail);
    assert("Total applications count >= 1", meData.stats?.totalApplications >= 1);

    // ── Test 9: Update Student Academic Profile
    const updateProfileRes = await fetch(`${BASE}/api/auth/profile`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            college: "IIT Bombay",
            degree: "M.Tech AI & Data Science",
            gradYear: "2026"
        })
    });
    assert("PUT /api/auth/profile succeeds HTTP 200", updateProfileRes.status === 200);
    const updatedData = await updateProfileRes.json();
    assert("Updated college is persisted", updatedData.user?.college === "IIT Bombay");

    // ── Test 10: Google Auth Token Verification Gate
    console.log("\n[5] Testing Google Authentication Security & Verification...");
    const badGoogleRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: "fake_invalid_google_jwt_token_12345" })
    });
    assert("POST /api/auth/google with invalid credential returns HTTP 401", badGoogleRes.status === 401);

    const emptyGoogleRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
    });
    assert("POST /api/auth/google with empty body returns HTTP 400", emptyGoogleRes.status === 400);

    // Test Config endpoint returns Google Client ID structure
    const configRes = await fetch(`${BASE}/api/auth/config`);
    assert("GET /api/auth/config returns HTTP 200", configRes.status === 200);
    const configJson = await configRes.json();
    assert("Config has googleClientId property", typeof configJson.googleClientId !== "undefined");

    console.log("\n==================================================");
    console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
    console.log("==================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

testAll().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
