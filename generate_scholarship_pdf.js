/**
 * ApplyReady AI — Generate and Inspect Sample Scholarship PDF Report
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_URL = "http://localhost:5000";

async function main() {
    console.log("1. Creating test scholarship application for PDF generation...");

    // Register student
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Deepika Mehta",
            email: `scholarship.student.${Date.now()}@example.com`,
            password: "SecurePassword123!",
            college: "NIT Trichy",
            degree: "B.Tech Electrical Engineering",
        }),
    });
    const regData = await regRes.json();
    const token = regData.token;

    // Create scholarship application
    const appRes = await fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            opportunityName: "National Merit Engineering Undergraduate Scholarship",
            officialUrl: "https://scholarships.gov.in/merit-2026",
            domain: "scholarship",
            requirementsText: "Eligibility Criteria: Minimum CGPA of 8.0 required. B.Tech students graduating in 2026. Required documents: Resume and Marksheet.",
        }),
    });
    const appData = await appRes.json();
    const appId = appData.application.id;
    console.log(`Created scholarship app: ${appId}`);

    const resumeBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_resume.pdf"));
    const marksheetBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_marksheet.pdf"));

    const formData = new FormData();
    formData.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "deepika_resume.pdf");
    formData.append("marksheet", new Blob([marksheetBuf], { type: "application/pdf" }), "deepika_marksheet.pdf");
    formData.append("requirementsText", "Minimum CGPA of 8.0 required. Batch of 2026.");

    const uploadRes = await fetch(`${BASE_URL}/api/applications/${appId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const assessData = await uploadRes.json();
    console.log("Scholarship assessment eligibility:", assessData.eligibilityResult?.status);

    const pdfPath = path.join(__dirname, "sample_scholarship_readiness_report.pdf");
    if (fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
    }

    const reportUrl = `http://localhost:5000/report.html?id=${appId}&token=${token}`;
    console.log(`Generating Scholarship PDF from: ${reportUrl}`);

    const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    const browserExe = fs.existsSync(edgePath) ? edgePath : (fs.existsSync(chromePath) ? chromePath : null);

    if (!browserExe) {
        throw new Error("Neither Edge nor Chrome browser executable found on system.");
    }

    const printCmd = `"${browserExe}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --virtual-time-budget=5000 --print-to-pdf="${pdfPath}" "${reportUrl}"`;
    execSync(printCmd, { stdio: "inherit", timeout: 30000 });

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF was not generated at expected location: ${pdfPath}`);
    }

    const pdfStats = fs.statSync(pdfPath);
    console.log(`\n🎉 SCHOLARSHIP PDF GENERATED SUCCESSFULLY! File size: ${pdfStats.size} bytes at: ${pdfPath}`);
}

main().catch(err => {
    console.error("Scholarship PDF error:", err);
    process.exit(1);
});
