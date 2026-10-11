/**
 * ApplyReady AI — Master Pipeline Verification Test Suite
 * Tests full end-to-end integration:
 * 1. Mandatory Auth Gate
 * 2. Admission rejection (HTTP 400)
 * 3. Scholarship Verification Pipeline (CGPA, degree, document consistency, integrity)
 * 4. Internship Intelligence Pipeline (JD-CV matching, dimensional score, proof-of-skill, CV lab)
 * 5. CV Improvement Lab Accept/Reject patch
 * 6. Grounded GenAI recommendations
 */

const fs = require("fs");
const path = require("path");

const API_BASE = "http://localhost:5000/api";
let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
    totalCount++;
    if (condition) {
        passedCount++;
        console.log(`  ✓ [PASS] ${message}`);
    } else {
        console.error(`  ✕ [FAIL] ${message}`);
        process.exitCode = 1;
    }
}

async function run() {
    console.log("\n=======================================================");
    console.log("  ApplyReady AI — Master Pipeline Verification Test");
    console.log("=======================================================\n");

    // ── 1. Mandatory Auth Gate ───────────────────────────────────────────────
    console.log("1. Testing Mandatory Authentication Gate...");
    const unauthAppRes = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "scholarship", opportunityName: "Test" }),
    });
    assert(unauthAppRes.status === 401, "Unauthenticated application creation rejected with HTTP 401");

    // ── 2. Register & Login ──────────────────────────────────────────────────
    console.log("\n2. Registering student account...");
    const testEmail = `tester_${Date.now()}@example.com`;
    const regRes = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Kritgna Patel",
            email: testEmail,
            password: "password123",
            college: "IIIT Pune",
            degree: "B.Tech ECE",
            gradYear: "2028",
        }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, "Student registered successfully");
    assert(Boolean(regData.token), "Auth token issued upon registration");
    const authToken = regData.token;

    // ── 3. Verify Admission Rejection ────────────────────────────────────────
    console.log("\n3. Verifying Admission category removal...");
    const admRes = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            domain: "admission",
            opportunityName: "Masters in CS",
        }),
    });
    assert(admRes.status === 400, "Category 'admission' strictly rejected with HTTP 400");

    // ── 4. Scholarship Verification Pipeline ─────────────────────────────────
    console.log("\n4. Testing Scholarship Verification Pipeline...");
    const scholAppRes = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            domain: "scholarship",
            opportunityName: "National Merit Scholarship 2026",
            requirementsText: "Eligibility: Minimum CGPA of 8.0, B.Tech students, Batch of 2026. Marksheet required.",
        }),
    });
    const scholAppData = await scholAppRes.json();
    assert(scholAppRes.status === 201, "Scholarship application created");
    const scholAppId = scholAppData.application.id;

    // Upload sample resume and marksheet
    const resumeBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_resume.pdf"));
    const marksheetBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_marksheet.pdf"));

    const scholForm = new FormData();
    scholForm.append("requirementsText", "Minimum CGPA of 8.0, Batch of 2026");
    scholForm.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "resume.pdf");
    scholForm.append("marksheet", new Blob([marksheetBuf], { type: "application/pdf" }), "marksheet.pdf");

    const scholDocRes = await fetch(`${API_BASE}/applications/${scholAppId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: scholForm,
    });
    const scholResult = await scholDocRes.json();
    assert(scholDocRes.status === 201, "Scholarship documents uploaded and assessed");
    assert(scholResult.eligibilityResult?.status === "eligible", "CGPA verified as eligible (8.85 >= 8.00)");
    assert(Boolean(scholResult.documentComparisonResult), "Cross-document comparison performed");
    assert(Boolean(scholResult.documentIntegrity), "Document integrity analyzed for resume");
    assert(scholResult.documentIntegrity?.status === "no_obvious_anomaly_detected", "Document integrity detected no anomalies");

    // ── 5. Internship Intelligence Pipeline ──────────────────────────────────
    console.log("\n5. Testing Internship Intelligence Pipeline...");
    const internAppRes = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            domain: "internship",
            opportunityName: "Backend Engineering Intern",
            githubUrl: "https://github.com/expressjs/express",
            requirementsText: `
                Job Description:
                Required Qualifications:
                - Strong experience in Python, Javascript, and Express.
                - Solid understanding of Data Structures and Git.

                Preferred Qualifications:
                - Experience with Docker, Kubernetes, and Cloud deployment.
                - Knowledge of unit testing.
            `,
        }),
    });
    const internAppData = await internAppRes.json();
    assert(internAppRes.status === 201, "Internship application created with GitHub URL");
    const internAppId = internAppData.application.id;

    // Upload resume for internship
    const internForm = new FormData();
    internForm.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "candidate_cv.pdf");
    internForm.append("githubUrl", "https://github.com/expressjs/express");

    const internDocRes = await fetch(`${API_BASE}/applications/${internAppId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: internForm,
    });
    const internResult = await internDocRes.json();
    assert(internDocRes.status === 201, "Internship documents assessed");

    const analysis = internResult.internshipAnalysis;
    assert(Boolean(analysis), "Internship Intelligence analysis generated");
    assert(typeof analysis.alignment_index === "number", `Alignment Index computed: ${analysis.alignment_index}%`);
    assert(Boolean(analysis.dimensions?.required_skills_coverage), "Required skills coverage dimension present");
    assert(Boolean(analysis.dimensions?.preferred_skills_coverage), "Preferred skills coverage dimension present");
    assert(Boolean(analysis.dimensions?.experience_evidence_score), "Experience evidence dimension present");
    assert(Array.isArray(analysis.skills_matrix) && analysis.skills_matrix.length > 0, `Skills matrix contains ${analysis.skills_matrix?.length} skills`);

    // ── 6. Proof of Skill Verification (GitHub) ──────────────────────────────
    console.log("\n6. Testing Proof-of-Skill GitHub engine...");
    const pos = internResult.proofOfSkill;
    assert(Boolean(pos), "Proof of skill result present");
    assert(pos.repository.includes("expressjs/express"), "Inspected target GitHub repository");
    assert(pos.detected_languages?.includes("JavaScript"), "Detected JavaScript language in repository");
    assert(pos.manifests_analyzed?.includes("package.json"), "Analyzed package.json manifest");
    assert(pos.verified_count > 0, `Verified ${pos.verified_count} technical skills from repo manifests`);

    // ── 7. CV Improvement Lab & Suggestion Patch ─────────────────────────────
    console.log("\n7. Testing CV Improvement Lab...");
    const suggestions = internResult.cvSuggestions || analysis.suggestions || [];
    assert(suggestions.length > 0, `Generated ${suggestions.length} truth-preserving CV suggestions`);
    const firstSug = suggestions[0];
    assert(Boolean(firstSug.suggested_bullet), "Suggested bullet point present");
    assert(!firstSug.suggested_bullet.includes("["), "Suggested bullet contains no raw bracketed placeholders");
    assert(Boolean(firstSug.metric_guidance), "Advisory metric guidance provided separately without fabricating numbers");

    // Test patching suggestion to 'accepted'
    const patchRes = await fetch(`${API_BASE}/applications/${internAppId}/cv-suggestions/${firstSug.id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: "accepted" }),
    });
    const patchData = await patchRes.json();
    assert(patchRes.status === 200 && patchData.newStatus === "accepted", "CV suggestion status successfully updated to 'accepted'");

    // Test Rerun CV Analysis endpoint with accepted suggestions
    console.log("\n7b. Testing Rerun CV Analysis (Before vs After Optimization)...");
    const rerunRes = await fetch(`${API_BASE}/applications/${internAppId}/rerun-cv-analysis`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            acceptedSuggestions: [{ ...firstSug, status: "accepted" }],
            beforeAlignmentIndex: analysis.alignment_index,
            beforeEvidenceScore: analysis.dimensions?.experience_evidence_score?.percentage || 0,
            opportunityName: "Backend Engineering Intern",
        }),
    });
    const rerunData = await rerunRes.json();
    assert(rerunRes.status === 200, "Rerun CV analysis returned HTTP 200");
    assert(Boolean(rerunData.beforeAfterComparison), "Generated beforeAfterComparison metrics");
    assert(typeof rerunData.beforeAfterComparison.delta_alignment === "number", "Calculated alignment delta metric");

    // ── 8. Grounded GenAI Recommendations ────────────────────────────────────
    console.log("\n8. Testing Grounded GenAI explanation...");

    const genaiRes = await fetch(`${API_BASE}/genai-explain`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            applicationId: internAppId,
            opportunity_name: "Backend Engineering Intern",
            domain: "internship",
            internship_analysis: analysis,
            proof_of_skill: pos,
            document_integrity: internResult.documentIntegrity,
        }),
    });
    const genaiData = await genaiRes.json();
    assert(genaiRes.status === 200, "GenAI service responded HTTP 200");
    if (genaiData.available) {
        assert(Boolean(genaiData.text), "Live grounded AI recommendations generated");
        assert(genaiData.text.includes("automated assessment suggestion"), "Enforces official decision disclaimer");
    } else {
        assert(Boolean(genaiData.note), "Graceful fallback note provided when key inactive");
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\n=======================================================");
    console.log(`  Test Suite Completed: ${passedCount}/${totalCount} assertions passed (${Math.round((passedCount/totalCount)*100)}%)`);
    console.log("=======================================================\n");

    if (passedCount === totalCount) {
        console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!\n");
        process.exit(0);
    } else {
        console.error("❌ SOME TESTS FAILED!\n");
        process.exit(1);
    }
}

run().catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
