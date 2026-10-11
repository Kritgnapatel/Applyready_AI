/**
 * ApplyReady AI — Generate and Inspect Sample PDF Report
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_URL = "http://localhost:5000";

async function main() {
    console.log("1. Creating test internship application for PDF generation...");

    // Register student
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Kritgna Patel",
            email: `pdf.student.${Date.now()}@example.com`,
            password: "SecurePassword123!",
            college: "Nirma University",
            degree: "B.Tech Computer Science",
        }),
    });
    const regData = await regRes.json();
    const token = regData.token;

    // Create internship application (No GitHub URL provided -> NOT RUN)
    const appRes = await fetch(`${BASE_URL}/api/applications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            opportunityName: "Software Engineering Intern — Backend & Distributed Systems",
            officialUrl: "https://careers.google.com/jobs/results/internship",
            domain: "internship",
            requirementsText: `
                Job Description:
                Required Qualifications:
                - Strong proficiency in Python, REST API development, and Git version control.
                - Solid foundation in Data Structures and Algorithms.

                Preferred Qualifications:
                - Experience with Docker containerization and Kubernetes.
                - Familiarity with Unit Testing frameworks.
            `,
            githubUrl: "",
        }),
    });
    const appData = await appRes.json();
    const appId = appData.application.id;
    console.log(`Created application: ${appId}`);

    // Upload candidate resume
    const resumeBuf = fs.readFileSync(path.join(__dirname, "ml-service", "temp_resume.pdf"));
    const formData = new FormData();
    formData.append("resume", new Blob([resumeBuf], { type: "application/pdf" }), "candidate_cv.pdf");

    const uploadRes = await fetch(`${BASE_URL}/api/applications/${appId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const assessData = await uploadRes.json();
    console.log("Document assessment completed.");

    // Accept one CV suggestion to test CV Lab rendering in report
    const suggestions = assessData.cvSuggestions || [];
    if (suggestions.length > 0) {
        await fetch(`${BASE_URL}/api/applications/${appId}/cv-suggestions/${suggestions[0].id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: "accepted" }),
        });
        console.log(`Accepted CV suggestion: ${suggestions[0].id}`);
    }

    // Output PDF target path
    const pdfPath = path.join(__dirname, "sample_internship_readiness_report.pdf");
    if (fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
    }

    const reportUrl = `http://localhost:5000/report.html?id=${appId}&token=${token}`;
    console.log(`Generating PDF from: ${reportUrl}`);

    // Generate PDF using headless Edge / Chrome
    const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    const browserExe = fs.existsSync(edgePath) ? edgePath : (fs.existsSync(chromePath) ? chromePath : null);

    if (!browserExe) {
        throw new Error("Neither Edge nor Chrome browser executable found on system.");
    }

    const printCmd = `"${browserExe}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --virtual-time-budget=5000 --print-to-pdf="${pdfPath}" "${reportUrl}"`;
    console.log(`Running headless browser print command...`);
    execSync(printCmd, { stdio: "inherit", timeout: 30000 });

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF was not generated at expected location: ${pdfPath}`);
    }

    const pdfStats = fs.statSync(pdfPath);
    console.log(`\n🎉 PDF GENERATED SUCCESSFULLY! File size: ${pdfStats.size} bytes at: ${pdfPath}`);
}

main().catch(err => {
    console.error("PDF Generation error:", err);
    process.exit(1);
});
