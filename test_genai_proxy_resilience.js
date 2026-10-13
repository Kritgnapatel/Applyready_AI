/**
 * ApplyReady AI — GenAI Guidance Proxy Resilience Test
 * Verifies that the Express /api/genai-explain proxy never forwards raw HTTP 503 or 502 to clients,
 * guaranteeing reports never break and graceful fallbacks are preserved.
 */

const http = require("http");
const assert = require("assert");

async function runTests() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — GENAI PROXY RESILIENCE TEST");
    console.log("==================================================");

    // Mock ML Service
    let mockStatus = 200;
    let mockPayload = { available: true, text: "Mock AI suggestion", method: "gemini_rest" };
    let mockDelayMs = 0;

    const mockMlServer = http.createServer((req, res) => {
        if (req.url === "/genai-explain") {
            setTimeout(() => {
                res.writeHead(mockStatus, { "Content-Type": "application/json" });
                res.end(JSON.stringify(mockPayload));
            }, mockDelayMs);
        } else if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "OK" }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    await new Promise((resolve) => mockMlServer.listen(9876, resolve));
    console.log("[Setup] Mock ML Server listening on port 9876");

    // Configure environment for backend
    process.env.ML_SERVICE_URL = "http://127.0.0.1:9876";
    process.env.PORT = "5999";
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "super_secure_random_key_for_testing_123456789012345";

    // Load backend server (server.js automatically calls app.listen on process.env.PORT)
    require("./backend/server");
    await new Promise((r) => setTimeout(r, 500));
    console.log("[Setup] Test Backend Server listening on port 5999");

    const BASE = "http://127.0.0.1:5999";

    // Create a mock user session token
    const regRes = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Test Student",
            email: `resilience_test_${Date.now()}@example.com`,
            password: "SecurePassword123!"
        })
    });
    const regData = await regRes.json();
    const token = regData.token;
    assert(token, "User registration should return an auth token");

    try {
        // Test 1: Successful GenAI guidance
        console.log("\n[Test 1] Successful AI Guidance response...");
        mockStatus = 200;
        mockPayload = { available: true, text: "Focus on React and Node.js projects.", method: "gemini_rest", model: "gemini-3.5-flash-lite" };
        
        let res = await fetch(`${BASE}/api/genai-explain`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ opportunity_name: "SWE Intern", domain: "internship" })
        });

        assert.strictEqual(res.status, 200, "Should return HTTP 200");
        let data = await res.json();
        assert.strictEqual(data.available, true, "available should be true");
        assert.strictEqual(data.text, "Focus on React and Node.js projects.");
        console.log("✅ Passed: Returns HTTP 200 with available=true");

        // Test 2: Upstream ML returns HTTP 503 (e.g. Render spin-down or model overload)
        console.log("\n[Test 2] Upstream returns HTTP 503 (Render cold-start / Overload)...");
        mockStatus = 503;
        mockPayload = { error: "Service Unavailable", note: "Upstream model overloaded" };

        res = await fetch(`${BASE}/api/genai-explain`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ opportunity_name: "SWE Intern", domain: "internship" })
        });

        assert.strictEqual(res.status, 200, "Backend MUST NOT return HTTP 503 to client; must return HTTP 200");
        data = await res.json();
        assert.strictEqual(data.available, false, "available must be false on 503");
        assert.strictEqual(data.method, "upstream_unavailable", "method should be upstream_unavailable");
        assert(data.note.includes("fully preserved") || data.note.includes("unavailable"), "Note must reassure user that findings are preserved");
        console.log("✅ Passed: Upstream 503 gracefully intercepted and returned as HTTP 200 with available=false");

        // Test 3: Upstream ML returns HTTP 502 (Bad Gateway / Crash)
        console.log("\n[Test 3] Upstream returns HTTP 502 (Bad Gateway)...");
        mockStatus = 502;
        mockPayload = { error: "Bad Gateway" };

        res = await fetch(`${BASE}/api/genai-explain`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ opportunity_name: "SWE Intern", domain: "internship" })
        });

        assert.strictEqual(res.status, 200, "Backend MUST return HTTP 200 on upstream 502");
        data = await res.json();
        assert.strictEqual(data.available, false);
        assert.strictEqual(data.method, "upstream_unavailable");
        console.log("✅ Passed: Upstream 502 gracefully intercepted and returned as HTTP 200 with available=false");

        // Test 4: Unauthenticated request should be rejected with 401
        console.log("\n[Test 4] Unauthenticated request rejection...");
        res = await fetch(`${BASE}/api/genai-explain`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ opportunity_name: "SWE Intern" })
        });
        assert.strictEqual(res.status, 401, "Unauthenticated request must return 401");
        console.log("✅ Passed: Unauthenticated request rejected with HTTP 401");

        console.log("\n==================================================");
        console.log("✅ ALL GENAI PROXY RESILIENCE TESTS PASSED (100%)!");
        mockMlServer.close();
        process.exit(0);
    } finally {
        mockMlServer.close();
    }
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
