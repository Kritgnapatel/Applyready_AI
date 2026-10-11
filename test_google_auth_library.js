/**
 * Verification Test: Google Sign-In with google-auth-library & Environment Configuration
 */

async function testGoogleAuth() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — GOOGLE AUTH LIBRARY TEST       ");
    console.log("==================================================");

    const BASE = "http://localhost:5000";
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

    // 1. Verify /api/auth/config returns the configured GOOGLE_CLIENT_ID
    console.log("\n[1] Checking /api/auth/config...");
    const configRes = await fetch(`${BASE}/api/auth/config`);
    assert("GET /api/auth/config returns HTTP 200", configRes.status === 200);
    const configData = await configRes.json();
    assert(
        "Config returns exact expected Google OAuth Client ID",
        configData.googleClientId === "780557102135-1ss4m4dqqfk95dq6et6k43vqrm98ca8l.apps.googleusercontent.com"
    );

    // 2. Test rejection of empty body
    console.log("\n[2] Checking POST /api/auth/google validation...");
    const emptyRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
    });
    assert("Empty POST /api/auth/google returns HTTP 400", emptyRes.status === 400);

    // 3. Test rejection of forged / invalid Google ID token with google-auth-library
    console.log("\n[3] Testing cryptographic token verification with google-auth-library...");
    const forgedToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXVkIjoiNzgwNTU3MTAyMTM1LTFzczRtNGRxcWZrOTVkcTZldDZrNDN2cXJtOThjYThsLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwiZW1haWwiOiJhdHRhY2tlckBleGFtcGxlLmNvbSJ9.bad_signature";
    const forgedRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: forgedToken })
    });
    assert("Forged Google ID token returns HTTP 401", forgedRes.status === 401);
    const forgedJson = await forgedRes.json();
    assert("Error message is returned from token verifier", typeof forgedJson.error === "string" && forgedJson.error.length > 0);
    console.log("  Rejection reason logged:", forgedJson.error);

    // 4. Test development user login integration via authenticated user creation
    console.log("\n[4] Testing user creation and session token issuance for Google authenticated identity...");
    const testGoogleEmail = `student.google.${Date.now()}@gmail.com`;
    const devGoogleRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: testGoogleEmail,
            name: "Verified Google Student",
            avatar: "https://lh3.googleusercontent.com/a/test-avatar",
            googleId: "google_sub_1092837465"
        })
    });
    assert("Google identity ingestion succeeds HTTP 200", devGoogleRes.status === 200);
    const devGoogleData = await devGoogleRes.json();
    assert("Returns session token for Google user", !!devGoogleData.token);
    assert("User record marked with authProvider: 'google'", devGoogleData.user?.authProvider === "google");
    assert("User email matches Google identity", devGoogleData.user?.email === testGoogleEmail);

    // 5. Test accessing protected routes with Google session token
    console.log("\n[5] Testing protected verification routes using Google session token...");
    const meRes = await fetch(`${BASE}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${devGoogleData.token}` }
    });
    assert("GET /api/auth/me accepts Google session token (HTTP 200)", meRes.status === 200);
    const meData = await meRes.json();
    assert("Profile matches authenticated Google student", meData.user?.email === testGoogleEmail);

    // 6. Test application creation with Google session token
    const appRes = await fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${devGoogleData.token}`
        },
        body: JSON.stringify({
            domain: "scholarship",
            opportunityName: "National Merit Scholarship 2026",
            requirementsText: "Minimum CGPA 8.5"
        })
    });
    assert("Google authenticated user can create application (HTTP 201)", appRes.status === 201);
    const appData = await appRes.json();
    assert("Application is tied to Google user's ID", appData.application.userId === devGoogleData.user.userId);

    // 7. Verify email/password login is still completely preserved
    console.log("\n[6] Verifying email/password registration & login is preserved...");
    const emailStudent = `email_user_${Date.now()}@university.edu`;
    const regRes = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Email Student",
            email: emailStudent,
            password: "StudentPassword123!",
            college: "IIIT Pune",
            degree: "B.Tech ECE",
            gradYear: "2028"
        })
    });
    assert("Email/password registration works (HTTP 201)", regRes.status === 201);

    const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: emailStudent,
            password: "StudentPassword123!"
        })
    });
    assert("Email/password login works (HTTP 200)", loginRes.status === 200);

    console.log("\n==================================================");
    console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
    console.log("==================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

testGoogleAuth().catch(err => {
    console.error("Test failed with exception:", err);
    process.exit(1);
});
