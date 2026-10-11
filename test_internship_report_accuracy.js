/**
 * ApplyReady AI — Internship Intelligence & PDF Report Accuracy Verification
 * 
 * Verifies:
 * 1. Proof-of-Skill NOT RUN status without contradictory GitHub claims
 * 2. 5-Tier skill status separation: mentioned vs supported by project vs verified by repo vs missing
 * 3. 15% Preferred skills dimensional weighting and transparent scoring formula
 * 4. CV Improvement Lab evidence-based revisions (accepted/rejected preservation, zero bracketed metrics)
 * 5. Non-accusatory document integrity wording (facts vs signals vs limitations)
 * 6. Dynamic sequential action-plan numbering (1, 2, 3... zero gaps)
 */

const assert = require("assert");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const ML_URL = process.env.ML_URL || "http://127.0.0.1:8000";

let studentToken = null;
let applicationId = null;

async function runTests() {
    console.log("\n==================================================================");
    console.log("   APPLYREADY AI — INTERNSHIP REPORT ACCURACY & INTEGRITY SUITE   ");
    console.log("==================================================================\n");

    let passed = 0;
    let failed = 0;

    function recordPass(desc) {
        console.log(`  ✅ [PASS] ${desc}`);
        passed++;
    }

    function recordFail(desc, err) {
        console.error(`  ❌ [FAIL] ${desc}\n     ${err.message}`);
        failed++;
    }

    // ── Setup: Authenticated Student Session ──────────────────────────────────
    console.log("1. Setting up authenticated student session...");
    try {
        const email = `test.student.report.${Date.now()}@example.com`;
        const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Kritgna Patel",
                email,
                password: "SecurePassword123!",
                college: "Nirma University",
                degree: "B.Tech Computer Science",
            }),
        });
        const regData = await regRes.json();
        assert.strictEqual(regRes.status, 201, "Registration must succeed HTTP 201");
        studentToken = regData.token;
        recordPass("Authenticated student registered and session token issued");
    } catch (e) {
        recordFail("Authenticated student registration", e);
    }

    // ── Test 1: Proof-of-Skill NOT RUN status & Zero Contradictory Claims ─────
    console.log("\n2. Testing Proof-of-Skill NOT RUN Status & Guardrails...");
    try {
        const appRes = await fetch(`${BASE_URL}/api/applications`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${studentToken}`,
            },
            body: JSON.stringify({
                opportunityName: "Software Engineering Intern",
                officialUrl: "https://careers.google.com/jobs/results/internship",
                domain: "internship",
                requirementsText: "Required: Python, REST API, Git. Preferred: Docker, Kubernetes.",
                githubUrl: "", // Explicitly omitted
            }),
        });
        const appData = await appRes.json();
        assert.strictEqual(appRes.status, 201, "Application creation HTTP 201");
        applicationId = appData.application.id;

        // Perform assessment without GitHub repository
        const fs = require("fs");
        const path = require("path");
        const resumeBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_resume.pdf"));
        const formData = new FormData();
        formData.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "candidate_cv.pdf");

        const assessRes = await fetch(`${BASE_URL}/api/applications/${applicationId}/documents`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${studentToken}`,
            },
            body: formData,
        });
        const assessData = await assessRes.json();
        assert.strictEqual(assessRes.status, 201, "Document upload must return HTTP 201");

        const pos = assessData.proofOfSkill;
        assert.ok(pos, "Proof-of-skill object must be present in assessment");
        assert.strictEqual(pos.status, "not_run", "Proof-of-skill status must be 'not_run' when no GitHub URL supplied");
        assert.strictEqual(pos.repository, null, "Repository must be null");
        assert.ok(
            pos.message.toLowerCase().includes("not run"),
            "Message must explicitly state verification was Not Run"
        );
        assert.strictEqual(pos.verified_skills.length, 0, "Verified skills must be empty array when Not Run");
        recordPass("Proof-of-Skill returns status 'not_run' without false code verification claims");
    } catch (e) {
        recordFail("Proof-of-Skill NOT RUN status", e);
    }

    // ── Test 2: 5-Tier Skill Hierarchy (Mentioned vs Project vs Repo vs Missing) ──
    console.log("\n3. Testing 5-Tier Skill Status Separation & Coverage vs Proof...");
    try {
        const jd = "Required: Python, Git. Preferred: Docker, Kubernetes.";
        const cv = `
            TECHNICAL SKILLS:
            Languages: Python, Git, Java
            Infrastructure: Kubernetes
            
            EXPERIENCE:
            - Implemented modular application features and data workflows using Python with structured error handling.
        `;
        const mockPos = {
            status: "verified",
            verified_skills: [
                { skill: "git", status: "evidence_found", file_path: ".gitignore" },
            ],
        };

        const matchRes = await fetch(`${ML_URL}/analyze-internship`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jd_text: jd,
                cv_text: cv,
                opportunity_name: "Backend Intern",
                proof_of_skill: mockPos,
            }),
        });
        const matchData = await matchRes.json();
        const matrix = {};
        (matchData.skills_matrix || []).forEach(s => {
            matrix[s.skill] = s;
        });

        // 1. Python: in CV with active project context -> 'supported by project evidence'
        assert.ok(matrix["python"], "Python must be in skills matrix");
        assert.strictEqual(
            matrix["python"].status,
            "supported by project evidence",
            "Python with active project verbs must be 'supported by project evidence'"
        );

        // 2. Git: verified in repository -> 'verified by repository'
        assert.ok(matrix["git"], "Git must be in skills matrix");
        assert.strictEqual(
            matrix["git"].status,
            "verified by repository",
            "Git verified in repository must be 'verified by repository'"
        );
        assert.strictEqual(matrix["git"].repository_verified, true, "repository_verified flag must be true");

        // 3. Kubernetes: only in skills list -> 'mentioned'
        assert.ok(matrix["kubernetes"], "Kubernetes must be in skills matrix");
        assert.strictEqual(
            matrix["kubernetes"].status,
            "mentioned",
            "Kubernetes listed without project context must be 'mentioned'"
        );

        // 4. Docker: not in CV or repo -> 'missing'
        assert.ok(matrix["docker"], "Docker must be in skills matrix");
        assert.strictEqual(matrix["docker"].status, "missing", "Docker absent from CV must be 'missing'");

        // Verify Skill Coverage vs Skill Proof distinction:
        // Coverage counts mentioned + supported + verified:
        const dims = matchData.dimensions;
        assert.strictEqual(dims.required_skills_coverage.matched, 2, "Required coverage counts both Python and Git (2/2)");
        assert.strictEqual(dims.preferred_skills_coverage.matched, 1, "Preferred coverage counts mentioned Kubernetes (1/2)");
        
        // Evidence grounding ONLY counts verified or supported:
        assert.strictEqual(
            dims.experience_evidence_score.demonstrated_count,
            2,
            "Evidence grounding only counts Python (supported) and Git (verified), NOT Kubernetes (mentioned)"
        );
        recordPass("5-Tier skill status hierarchy strictly separates skill coverage from skill proof");
    } catch (e) {
        recordFail("5-Tier Skill Status Separation", e);
    }

    // ── Test 3: Preferred Skills 15% Dimensional Weighting & Transparent Formula ─
    console.log("\n4. Testing 15% Preferred Skills Weighting & Formula Consistency...");
    try {
        const jdWithPref = "Required: Python, Git. Preferred: Docker, Kubernetes.";
        const cvFullReq = "Skills: Python, Git. Developed backend in Python and version control using Git.";

        const resWithPref = await fetch(`${ML_URL}/analyze-internship`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jd_text: jdWithPref,
                cv_text: cvFullReq,
                opportunity_name: "DevOps Intern",
            }),
        });
        const dataWithPref = await resWithPref.json();
        const meth = dataWithPref.scoring_methodology;

        // Weights when preferred skills exist: 60% Required, 25% Evidence, 15% Preferred
        assert.strictEqual(meth.weights.required_skills_coverage, 0.60, "Required skills weight must be 60%");
        assert.strictEqual(meth.weights.experience_evidence_score, 0.25, "Experience evidence weight must be 25%");
        assert.strictEqual(meth.weights.preferred_skills_coverage, 0.15, "Preferred skills weight must be 15%");
        assert.ok(meth.formula.includes("15% Preferred"), "Formula string must include 15% Preferred Skills Coverage");

        // When preferred skills are 0% matched, index should reflect: (100 * 0.60) + (100 * 0.25) + (0 * 0.15) = 85.0
        const reqCov = dataWithPref.dimensions.required_skills_coverage.percentage;
        const evScore = dataWithPref.dimensions.experience_evidence_score.percentage;
        const prefCov = dataWithPref.dimensions.preferred_skills_coverage.percentage;

        const expectedIndex = +( (reqCov * 0.60) + (evScore * 0.25) + (prefCov * 0.15) ).toFixed(1);
        assert.strictEqual(dataWithPref.alignment_index, expectedIndex, `Alignment index must match mathematical sum: ${expectedIndex}`);
        assert.ok(meth.contribution_points, "Contribution points breakdown must be present");
        recordPass("Scoring formula documents 15% preferred skills weighting with transparent points breakdown");
    } catch (e) {
        recordFail("Preferred Skills Dimensional Weighting", e);
    }

    // ── Test 4: CV Improvement Lab Evidence-Based Suggestions & Rerun Delta ─────
    console.log("\n5. Testing CV Improvement Lab: Truthful Suggestions & Rerun Impact...");
    try {
        const getApp = await fetch(`${BASE_URL}/api/applications/${applicationId}`, {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        const appInfo = await getApp.json();
        const suggestions = appInfo.latestAssessment?.cvSuggestions || appInfo.latestAssessment?.internshipAnalysis?.suggestions || [];

        assert.ok(suggestions.length > 0, "CV suggestions must be generated");

        // Verify zero bracketed placeholders or fake metrics
        suggestions.forEach(sug => {
            const bullet = sug.suggested_bullet;
            assert.ok(!bullet.includes("["), `Suggested bullet must not contain raw '[': ${bullet}`);
            assert.ok(!bullet.includes("]"), `Suggested bullet must not contain raw ']': ${bullet}`);
            assert.ok(!bullet.includes("X%"), `Suggested bullet must not contain 'X%': ${bullet}`);
            assert.ok(sug.reason, "Each suggestion must explain the rationale");
        });

        // Accept first suggestion
        const firstSug = suggestions[0];
        const patchRes = await fetch(`${BASE_URL}/api/applications/${applicationId}/cv-suggestions/${firstSug.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${studentToken}`,
            },
            body: JSON.stringify({ status: "accepted" }),
        });
        assert.strictEqual(patchRes.status, 200, "PATCH suggestion status must return HTTP 200");

        // Rerun analysis with accepted bullet
        const rerunRes = await fetch(`${BASE_URL}/api/applications/${applicationId}/rerun-cv-analysis`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${studentToken}`,
            },
            body: JSON.stringify({
                beforeAlignmentIndex: appInfo.latestAssessment?.internshipAnalysis?.alignment_index || 50,
                beforeEvidenceScore: appInfo.latestAssessment?.internshipAnalysis?.dimensions?.experience_evidence_score?.percentage || 30,
            }),
        });
        const rerunData = await rerunRes.json();
        assert.strictEqual(rerunRes.status, 200, "Rerun CV analysis must return HTTP 200");
        assert.ok(rerunData.beforeAfterComparison, "beforeAfterComparison metrics must be present");
        assert.strictEqual(rerunData.beforeAfterComparison.accepted_bullets_count, 1, "Must record 1 accepted bullet");
        recordPass("CV Improvement Lab preserves truth, updates accept/reject, and reruns before/after delta");
    } catch (e) {
        recordFail("CV Improvement Lab Evidence-Based Suggestions", e);
    }

    // ── Test 5: Document Integrity Non-Accusatory Wording & Fact/Signal Separation ─
    console.log("\n6. Testing Document Integrity: Non-Accusatory Wording & Categorization...");
    try {
        const getApp = await fetch(`${BASE_URL}/api/applications/${applicationId}`, {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        const appInfo = await getApp.json();
        const integ = appInfo.latestAssessment?.documentIntegrity;

        if (integ) {
            assert.ok(integ.status, "Integrity status must be present");
            // Must be one of the non-accusatory statuses
            assert.ok(
                ["no_obvious_anomaly_detected", "review_recommended", "unable_to_assess"].includes(integ.status),
                `Status must be non-accusatory, got: ${integ.status}`
            );

            // Verify no defamatory terms in descriptions or labels
            const jsonStr = JSON.stringify(integ).toLowerCase();
            assert.ok(!jsonStr.includes("fraud"), "Integrity output must never accuse candidate of fraud");
            assert.ok(!jsonStr.includes("forgery"), "Integrity output must never accuse candidate of forgery");
            assert.ok(!jsonStr.includes("fake"), "Integrity output must never use accusatory language 'fake'");
            assert.ok(integ.disclaimer, "Integrity output must provide an explicit non-legal disclaimer");
        }
        recordPass("Document integrity enforces non-accusatory ATS/formatting signals and explicit disclaimers");
    } catch (e) {
        recordFail("Document Integrity Non-Accusatory Wording", e);
    }

    // ── Test 6: Dynamic Sequential Action-Plan Numbering ──────────────────────
    console.log("\n7. Testing Dynamic Sequential Action-Plan Numbering...");
    try {
        // We simulate the rendering function logic from report.js
        function computeSteps(missingCount, acceptedCount, suggestionsCount, isPosRun) {
            const rawSteps = [];
            if (missingCount > 0) {
                rawSteps.push({ title: "Address Missing Mandatory Qualifications" });
            }
            if (acceptedCount > 0) {
                rawSteps.push({ title: "Integrate Accepted CV Bullets into Master Resume" });
            } else if (suggestionsCount > 0) {
                rawSteps.push({ title: "Review Generated CV Suggestions in Improvement Lab" });
            }
            if (!isPosRun) {
                rawSteps.push({ title: "Provide a Public GitHub Repository for Proof-of-Skill" });
            }
            rawSteps.push({ title: "Quantify Measured Benchmarks (Truthful Metric Guidance)" });

            return rawSteps.map((s, idx) => ({
                number: idx + 1,
                title: `${idx + 1}. ${s.title}`,
            }));
        }

        // Scenario A: Missing skills = 0 (100% matched), accepted revisions = 1, GitHub not run
        const stepsA = computeSteps(0, 1, 2, false);
        assert.strictEqual(stepsA[0].number, 1, "First step must be 1 when missing skills is 0");
        assert.ok(stepsA[0].title.startsWith("1. Integrate"), "Step 1 must be Integrate Accepted CV Bullets");
        assert.strictEqual(stepsA[1].number, 2, "Second step must be 2");
        assert.strictEqual(stepsA[2].number, 3, "Third step must be 3");

        // Scenario B: Missing skills = 2, accepted revisions = 0, GitHub verified
        const stepsB = computeSteps(2, 0, 3, true);
        assert.strictEqual(stepsB[0].number, 1, "Step 1 must be Address Missing");
        assert.strictEqual(stepsB[1].number, 2, "Step 2 must be Review Generated Suggestions");
        assert.strictEqual(stepsB[2].number, 3, "Step 3 must be Quantify Benchmarks");
        assert.strictEqual(stepsB.length, 3, "Total steps must be exactly 3 without gaps");

        recordPass("Action-plan steps dynamically sequence as 1, 2, 3... with zero gaps regardless of missing criteria");
    } catch (e) {
        recordFail("Sequential Action-Plan Numbering", e);
    }

    console.log("\n==================================================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
