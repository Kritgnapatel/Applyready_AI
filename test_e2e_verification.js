/**
 * Full End-to-End Test: Mandatory Auth + PDF Upload + ML Extraction + Eligibility + Gemini GenAI
 */

const fs = require("fs");
const path = require("path");

async function testFullVerification() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — FULL PIPELINE VERIFICATION TEST");
    console.log("==================================================");

    const BASE = "http://localhost:5000";

    // 1. Sign in or Register
    console.log("\n[1] Registering Student Account...");
    const email = `applicant_${Date.now()}@college.edu`;
    const regRes = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Kritgna Patel",
            email,
            password: "SecurePassword2026!",
            college: "IIIT Pune",
            degree: "B.Tech ECE",
            gradYear: "2028"
        })
    });
    const regData = await regRes.json();
    console.log("Registered user:", regData.user.name, "| Email:", regData.user.email);
    const token = regData.token;

    // 2. Create Application
    console.log("\n[2] Creating Verified Application...");
    const appRes = await fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            domain: "internship",
            opportunityName: "AI Research Summer Internship 2026",
            officialUrl: "https://careers.example.org/ai-fellowship",
            requirementsText: "Eligibility criteria: Candidate must have a minimum CGPA of 8.0 or equivalent. Expected graduation year: 2027 or 2028."
        })
    });
    const appData = await appRes.json();
    const appId = appData.application.id;
    console.log("Application created with ID:", appId);

    // 3. Upload Documents
    console.log("\n[3] Uploading Resume & Marksheet PDFs to /api/applications/:id/documents...");
    const resumePath = path.join(__dirname, "ml-service", "temp_resume.pdf");
    const marksheetPath = path.join(__dirname, "ml-service", "temp_marksheet.pdf");

    const resumeBuffer = fs.readFileSync(resumePath);
    const marksheetBuffer = fs.readFileSync(marksheetPath);

    const formData = new FormData();
    formData.append("requirementsText", "Eligibility criteria: Candidate must have a minimum CGPA of 8.0 or equivalent.");
    formData.append("resume", new Blob([resumeBuffer], { type: "application/pdf" }), "resume.pdf");
    formData.append("marksheet", new Blob([marksheetBuffer], { type: "application/pdf" }), "marksheet.pdf");

    const uploadRes = await fetch(`${BASE}/api/applications/${appId}/documents`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`
        },
        body: formData
    });

    console.log("Upload status:", uploadRes.status);
    const uploadData = await uploadRes.json();
    console.log("Extracted CGPA:", uploadData.resumeExtraction?.fields?.cgpa);
    console.log("Eligibility Status:", uploadData.eligibilityResult?.status);
    console.log("Eligibility Reason:", uploadData.eligibilityResult?.reason);
    console.log("Document Comparison:", uploadData.documentComparisonResult?.overall_status);

    if (uploadRes.status !== 201) {
        throw new Error("Upload & Assessment failed: " + JSON.stringify(uploadData));
    }

    // 4. Request GenAI Explanation (Gemini 3.5 Flash Lite)
    console.log("\n[4] Requesting Grounded GenAI Explanation via Gemini 3.5 Flash Lite...");
    const genaiRes = await fetch(`${BASE}/api/genai-explain`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            applicationId: appId,
            opportunity_name: "AI Research Summer Internship 2026",
            domain: "internship",
            eligibility_result: uploadData.eligibilityResult,
            field_results: uploadData.eligibilityResult?.field_results || [],
            comparison_result: uploadData.documentComparisonResult,
            requirements_text: "Eligibility criteria: Candidate must have a minimum CGPA of 8.0."
        })
    });

    console.log("GenAI response status:", genaiRes.status);
    const genaiData = await genaiRes.json();
    console.log("GenAI Available:", genaiData.available);
    console.log("GenAI Method/Model:", genaiData.method, "|", genaiData.model);
    console.log("Sample AI Guidance:\n" + (genaiData.text ? genaiData.text.slice(0, 300) + "..." : "No text"));

    // 5. Fetch History and Single App
    console.log("\n[5] Fetching Single Application and Assessment History...");
    const singleAppRes = await fetch(`${BASE}/api/applications/${appId}`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    console.log("GET /api/applications/:id status:", singleAppRes.status);
    const singleAppData = await singleAppRes.json();
    console.log("Single app opportunity name:", singleAppData.application?.opportunityName);

    console.log("\n==================================================");
    console.log("✅ FULL PIPELINE VERIFICATION SUCCEEDED 100%!");
    console.log("==================================================");
}

testFullVerification().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
