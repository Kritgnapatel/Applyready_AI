/**
 * ApplyReady AI - Accuracy Fixes & Polish Verification Test
 */
const assert = require("assert");

const BASE_URL = "http://localhost:5000";
const ML_URL = "http://localhost:8000";

async function runTests() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — ACCURACY FIXES & POLISH TEST   ");
    console.log("==================================================\n");

    let passed = 0;
    const test = (name, fn) => {
        try {
            fn();
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ FAIL: ${name}`);
            console.error(e.message);
            process.exit(1);
        }
    };

    // 1. Test contact info filter and truthful missing suggestions in ML service
    console.log("[1] Testing ML Matcher: Contact info filtering & Truthful missing skills...");
    const matchRes = await fetch(`${ML_URL}/analyze-internship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            cv_text: "Contact: rahul.git@gmail.com | Phone: +91-9876543210 | Portfolio: github.com/rahul\nEducation: B.Tech Computer Engineering\nProjects: Built a web service using JavaScript and Express.",
            jd_text: "Requirements: Python, Git, Docker, JavaScript, Express.\nPreferred: Kubernetes",
            opportunity_name: "Software Engineering Intern"
        })
    });
    assert.strictEqual(matchRes.status, 200);
    const matchData = await matchRes.json();

    test("Contact email rahul.git@gmail.com does NOT falsely match 'git'", () => {
        const gitSkill = matchData.skills_matrix.find(s => s.skill.toLowerCase() === "git");
        assert(gitSkill, "Git should be extracted from JD");
        // Because git only appeared in rahul.git@gmail.com, it must be marked missing, NOT demonstrated or mentioned
        assert.strictEqual(gitSkill.status, "missing", `Expected 'git' to be missing, got: ${gitSkill.status}`);
    });

    test("Scoring methodology formula and weights are explicitly documented", () => {
        assert(matchData.scoring_methodology, "scoring_methodology missing");
        assert(matchData.scoring_methodology.weights, "weights missing");
        assert.strictEqual(matchData.scoring_methodology.weights.required_skills_coverage, 0.60);
        assert.strictEqual(matchData.scoring_methodology.weights.preferred_skills_coverage, 0.15);
        assert.strictEqual(matchData.scoring_methodology.weights.experience_evidence_score, 0.25);
    });

    test("Truthful suggestions contain information_request and non_quantified_alternative without fabricated metrics", () => {
        assert(Array.isArray(matchData.suggestions) && matchData.suggestions.length > 0, "Suggestions should be generated");
        const missingSkillSug = matchData.suggestions.find(s => s.type === "missing_skill_action");
        assert(missingSkillSug, "Missing skill action suggestion should be generated");
        assert(missingSkillSug.information_request, "information_request must be present");
        assert(missingSkillSug.non_quantified_alternative, "non_quantified_alternative must be present");
        // Never contain fake percentage metrics like "improved by 45%"
        assert(!missingSkillSug.suggested_bullet.match(/\b\d{2,3}%\b/), "No invented percentage metrics in suggestion");
    });

    // 2. Test Proof-of-Skill: not_run vs verified with file_path
    console.log("\n[2] Testing Proof-of-Skill Engine...");
    const emptyPosRes = await fetch(`${ML_URL}/verify-skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            github_url: "",
            claimed_skills: ["JavaScript", "Python"]
        })
    });
    assert.strictEqual(emptyPosRes.status, 200);
    const emptyPosData = await emptyPosRes.json();

    test("Empty GitHub URL returns status 'not_run'", () => {
        assert.strictEqual(emptyPosData.status, "not_run");
        assert.strictEqual(emptyPosData.verified_count, 0);
    });

    const repoPosRes = await fetch(`${ML_URL}/verify-skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            github_url: "https://github.com/expressjs/express",
            claimed_skills: ["JavaScript", "Node.js"]
        })
    });
    assert.strictEqual(repoPosRes.status, 200);
    const repoPosData = await repoPosRes.json();

    test("GitHub inspection includes exact file_path for verified skills", () => {
        assert(repoPosData.verified_skills.length > 0, "verified_skills should not be empty");
        const jsSkill = repoPosData.verified_skills.find(s => s.skill.toLowerCase() === "javascript");
        assert(jsSkill, "JavaScript should be verified in express repo");
        assert(jsSkill.file_path, "file_path must be present on verified skill");
        assert(jsSkill.file_path.includes("Repository Language") || jsSkill.file_path.includes("package.json"), "Expected file path");
    });

    // 3. Test Backend Auth & End-to-End Persistence
    console.log("\n[3] Testing Backend Separate Preservation & Rerun...");
    const rand = Date.now();
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Candidate Test",
            email: `candidate_${rand}@applyready.io`,
            password: "Password123!",
            college: "Tech University",
            degree: "B.Tech",
            gradYear: "2026"
        })
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    const token = regData.token;

    // Create internship application WITHOUT githubUrl
    const appRes = await fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            domain: "internship",
            opportunityName: "Backend Engineer Intern",
            requirementsText: "Must have JavaScript, Express, Docker."
        })
    });
    assert.strictEqual(appRes.status, 201);
    const appData = await appRes.json();
    const appId = appData.application.id;

    // Assessment without githubUrl
    const fs = require("fs");
    const path = require("path");
    const resumeBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_resume.pdf"));
    const formData = new FormData();
    formData.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "resume.pdf");

    const assessRes = await fetch(`${BASE_URL}/api/applications/${appId}/documents`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
    });
    assert.strictEqual(assessRes.status, 201);
    const assessData = await assessRes.json();

    test("Proof of skill is 'not_run' when application has no githubUrl", () => {
        assert(assessData.proofOfSkill, "proofOfSkill result missing");
        assert.strictEqual(assessData.proofOfSkill.status, "not_run");
    });

    test("Original CV text is preserved separately in assessment", () => {
        assert(typeof assessData.originalCvText === "string", "originalCvText should be string");
        assert(assessData.originalCvText.length > 0, "originalCvText should not be empty");
    });

    // Rerun with accepted suggestions
    const suggestions = assessData.cvSuggestions || [];
    if (suggestions.length > 0) {
        suggestions[0].status = "accepted";
    }

    const rerunRes = await fetch(`${BASE_URL}/api/applications/${appId}/rerun-cv-analysis`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            acceptedSuggestions: suggestions,
            beforeAlignmentIndex: assessData.internshipAnalysis?.alignment_index || 0,
            beforeEvidenceScore: 0,
            jdText: "Must have JavaScript, Express, Docker.",
            opportunityName: "Backend Engineer Intern"
        })
    });
    assert.strictEqual(rerunRes.status, 200);
    const rerunData = await rerunRes.json();

    test("Rerun CV analysis separates original and revised CV text and records accepted revisions", () => {
        assert(rerunData.beforeAfterComparison, "beforeAfterComparison missing");
        assert(Array.isArray(rerunData.acceptedRevisions), "acceptedRevisions missing");
        assert(rerunData.originalCvText, "originalCvText missing in rerun response");
        assert(rerunData.revisedCvText, "revisedCvText missing in rerun response");
    });

    // 4. Admission category strict rejection
    console.log("\n[4] Testing Domain Isolation (Admission rejection)...");
    const admRes = await fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            domain: "admission",
            opportunityName: "MS Computer Science"
        })
    });
    test("Category 'admission' returns HTTP 400", () => {
        assert.strictEqual(admRes.status, 400);
    });

    console.log("\n==================================================");
    console.log(`ALL ${passed} ACCURACY & POLISH ASSERTIONS PASSED!`);
    console.log("==================================================");
}

runTests().catch(err => {
    console.error("Test failed with exception:", err);
    process.exit(1);
});
