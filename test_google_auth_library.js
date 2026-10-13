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

    // 4. Regression Test: Verify email-only request CANNOT impersonate another user
    console.log("\n[4] Testing rejection of email-only impersonation attempt (no token)...");
    const victimEmail = `victim.user.${Date.now()}@gmail.com`;
    const impersonationRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: victimEmail,
            name: "Victim User",
            avatar: "https://lh3.googleusercontent.com/a/victim-avatar",
            googleId: "fake_google_id_9999"
        })
    });
    assert("Email-only impersonation attempt is rejected (HTTP 400)", impersonationRes.status === 400);
    const impersonationJson = await impersonationRes.json();
    assert("Rejection specifies credential ID token is required", impersonationJson.error === "Google credential ID token is required.");
    console.log("  Rejection message verified:", impersonationJson.error);

    // 4b. Regression Test: Verify non-string or null credential is also rejected
    const nullCredRes = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: null, email: victimEmail })
    });
    assert("Null credential with email is rejected (HTTP 400)", nullCredRes.status === 400);

    // 5. Test protected verification routes with valid session token
    console.log("\n[5] Testing protected verification routes using authenticated student session...");
    const authStudentEmail = `student.auth.${Date.now()}@gmail.com`;
    const regStudentRes = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Verified Student",
            email: authStudentEmail,
            password: "ValidSecurePassword2026!",
            college: "IIIT Pune",
            degree: "B.Tech ECE",
            gradYear: "2028"
        })
    });
    assert("Student registration succeeds (HTTP 201)", regStudentRes.status === 201);
    const studentData = await regStudentRes.json();
    assert("Session token issued for student", !!studentData.token);

    const meRes = await fetch(`${BASE}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${studentData.token}` }
    });
    assert("GET /api/auth/me accepts session token (HTTP 200)", meRes.status === 200);
    const meData = await meRes.json();
    assert("Profile matches authenticated student", meData.user?.email === authStudentEmail);

    // 6. Test application creation with authenticated session token
    const appRes = await fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${studentData.token}`
        },
        body: JSON.stringify({
            domain: "scholarship",
            opportunityName: "National Merit Scholarship 2026",
            requirementsText: "Minimum CGPA 8.5"
        })
    });
    assert("Authenticated user can create application (HTTP 201)", appRes.status === 201);
    const appData = await appRes.json();
    assert("Application is tied to user's ID", appData.application.userId === studentData.user.userId);

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
