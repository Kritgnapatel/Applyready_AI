
"use strict";

// Guard: Require login before viewing verification report
if (typeof requirePageAuth === "function") {
    requirePageAuth();
}

// ── Load saved application ────────────────────────────────────────────────────
let application = null;

const reviewDomain      = document.getElementById("reviewDomain");
const reviewName        = document.getElementById("reviewName");
const reviewUrl         = document.getElementById("reviewUrl");
const reviewRequirements= document.getElementById("reviewRequirements");
const reviewFiles       = document.getElementById("reviewFiles");
const eligibilityContainer  = document.getElementById("eligibilityDetails");
const extractionContainer   = document.getElementById("extractionDetails");
const comparisonContainer   = document.getElementById("comparisonDetails");
const classificationSection = document.getElementById("classificationSection");
const classificationContainer = document.getElementById("classificationDetails");
const issuesSection     = document.getElementById("issuesSection");
const issuesList        = document.getElementById("issuesList");
const genaiSection      = document.getElementById("genaiSection");
const genaiContent      = document.getElementById("genaiContent");
const statusBar         = document.getElementById("overallStatusBar");
const statusBarIcon     = document.getElementById("statusBarIcon");
const statusBarLabel    = document.getElementById("statusBarLabel");
const statusBarReason   = document.getElementById("statusBarReason");
const reviewMessage     = document.getElementById("reviewMessage");
const downloadBtn       = document.getElementById("downloadReportBtn");

async function initReview() {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get("id");
    application = typeof loadApplication === "function" ? loadApplication() : null;

    if (appId && (!application || (application.id !== appId && application.appId !== appId))) {
        try {
            const detail = await apiFetch(`/api/applications/${encodeURIComponent(appId)}`);
            if (detail && detail.application) {
                application = {
                    ...detail.application,
                    id: detail.application.appId || detail.application.id,
                    ...(detail.latestAssessment || {}),
                };
                if (typeof saveApplication === "function") {
                    saveApplication(application);
                }
            }
        } catch (e) {
            console.warn("Could not fetch application from API:", e);
        }
    }

    if (!application) {
        if (reviewMessage) {
            reviewMessage.textContent =
                "No uploaded application found. Please start from the dashboard.";
        }
        if (eligibilityContainer) eligibilityContainer.textContent = "No application available.";
        if (extractionContainer)  extractionContainer.textContent  = "No extraction results.";
        if (comparisonContainer)  comparisonContainer.textContent  = "No comparison results.";
        return;
    }

    renderAll(application);
}

initReview();

// ─────────────────────────────────────────────────────────────────────────────
function renderAll(app) {
    renderOpportunityDetails(app);
    renderFiles(app);

    const elSec = document.getElementById("eligibilitySection");
    const extSec = document.getElementById("extractionSection");
    const compSec = document.getElementById("comparisonSection");
    const classSec = document.getElementById("classificationSection");
    const internAlignSec = document.getElementById("internshipAlignmentSection");
    const internMatrixSec = document.getElementById("internshipSkillsMatrixSection");
    const proofSec = document.getElementById("proofOfSkillSection");
    const cvLabSec = document.getElementById("cvImprovementLabSection");

    if (app.domain === "internship") {
        // Hide all scholarship-specific verification cards
        if (elSec) elSec.style.display = "none";
        if (extSec) extSec.style.display = "none";
        if (compSec) compSec.style.display = "none";
        if (classSec) classSec.style.display = "none";

        // Render internship intelligence cards
        renderInternshipAlignment(app);
        renderInternshipSkillsMatrix(app);
        renderProofOfSkill(app);
        renderCvImprovementLab(app);
        renderDocumentIntegrity(app);
    } else {
        // Hide all internship-specific cards
        if (internAlignSec) internAlignSec.style.display = "none";
        if (internMatrixSec) internMatrixSec.style.display = "none";
        if (proofSec) proofSec.style.display = "none";
        if (cvLabSec) cvLabSec.style.display = "none";

        // Render scholarship verification cards
        renderEligibility(app);
        renderExtraction(app);
        renderComparison(app);
        renderClassification(app);
        renderDocumentIntegrity(app);
    }


    renderPriorityIssues(app);
    renderOverallStatus(app);
    loadGenAI(app);
    if (reviewMessage) {
        reviewMessage.textContent =
            `Assessment ID: ${app.id || app.applicationId || "—"}`;
    }

    // Fix action buttons with correct context
    const editBtn = document.getElementById("editReassessBtn");
    if (editBtn && app.domain) {
        editBtn.href = `requirements.html?domain=${encodeURIComponent(app.domain)}`;
    }
    const viewReportBtn = document.getElementById("viewReportBtn");
    if (viewReportBtn && (app.id || app.applicationId)) {
        viewReportBtn.href = `report.html?id=${encodeURIComponent(app.id || app.applicationId)}`;
    }
}

// ── Opportunity Details ───────────────────────────────────────────────────────
function renderOpportunityDetails(app) {
    const DOMAIN_LABELS = {
        scholarship: "Scholarship",
        internship:  "Internship",
    };
    if (reviewDomain)     reviewDomain.textContent     = DOMAIN_LABELS[app.domain] || "—";
    if (reviewName)       reviewName.textContent       = app.opportunityName || "—";
    if (reviewRequirements) {
        reviewRequirements.textContent = app.requirementsText || "Not provided";
    }

    if (reviewUrl) {
        reviewUrl.replaceChildren();
        if (app.officialUrl) {
            try {
                const parsed = new URL(app.officialUrl);
                if (["https:", "http:"].includes(parsed.protocol)) {
                    const link = document.createElement("a");
                    link.href = parsed.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = parsed.href;
                    link.style.color = "var(--cyan)";
                    reviewUrl.append(link);
                } else {
                    reviewUrl.textContent = "Invalid URL";
                }
            } catch {
                reviewUrl.textContent = "Invalid URL";
            }
        } else {
            reviewUrl.textContent = "Not provided";
        }
    }
}

// ── Files ─────────────────────────────────────────────────────────────────────
function renderFiles(app) {
    if (!reviewFiles) return;
    reviewFiles.replaceChildren();
    const files = app.files || [];
    if (!files.length) {
        reviewFiles.textContent = "No uploaded documents found.";
        return;
    }
    files.forEach((file) => {
        const sizeKB = ((file.size || 0) / 1024).toFixed(1);
        const FIELD_ICONS = { resume: "📋", marksheet: "📊", certificate: "🏆", requirementsFile: "📄" };
        reviewFiles.append(
            createCard({
                title: file.originalName || "Document",
                description: `${FIELD_ICONS[file.field] || "📄"} ${file.field} · ${sizeKB} KB · Uploaded`,
                status: null,
            })
        );
    });
}

// ── Eligibility ───────────────────────────────────────────────────────────────
function renderEligibility(app) {
    if (!eligibilityContainer) return;
    eligibilityContainer.replaceChildren();

    const result = app.eligibilityResult;
    if (!result) {
        eligibilityContainer.append(
            createCard({ title: "No Eligibility Data", description: "No result returned. Check that the backend is running.", status: "needs_review" })
        );
        return;
    }

    // Top-level CGPA result
    const mainCard = createCard({
        title: result.status === "eligible" ? "CGPA Requirement Met" :
               result.status === "not_met"  ? "CGPA Requirement Not Met" :
               result.status === "missing"  ? "CGPA Not Found in Document" :
               "CGPA Needs Review",
        description: result.reason || "No explanation available.",
        status: result.status || "needs_review",
        icon: result.status === "eligible" ? "✅" :
              result.status === "not_met"  ? "❌" : "🔍",
    });
    eligibilityContainer.append(mainCard);

    // Values row
    if (result.actual_value !== null && result.actual_value !== undefined) {
        addDetailRow(eligibilityContainer, "Your CGPA", result.actual_value);
    }
    if (result.required_value !== null && result.required_value !== undefined) {
        addDetailRow(eligibilityContainer, "Required CGPA", result.required_value);
    }

    // Requirement source
    const pdfResult = app.requirementsPdfResult || {};
    const source = result.requirement_source || (app.requirementsText ? "manual_text" : null);
    if (source) {
        addDetailRow(eligibilityContainer, "Requirement Source",
            source === "manual_text" ? "Manually entered requirements" :
            source === "requirements_pdf" ? "Requirements PDF" : source
        );
    }

    // Requirement evidence
    const evidence = result.requirement_evidence || pdfResult.evidence || result.evidence;
    if (evidence) {
        addDetailRow(eligibilityContainer, "Requirement Evidence", evidence);
    }

    // Field-level results (comprehensive check)
    const comprehensive = result.comprehensive;
    if (comprehensive && comprehensive.field_results && comprehensive.field_results.length > 0) {
        const divider = document.createElement("p");
        divider.style.cssText = "margin: 16px 0 8px; font-weight: 600; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;";
        divider.textContent = "All Criteria";
        eligibilityContainer.append(divider);

        comprehensive.field_results.forEach((fr) => {
            const fieldCard = createCard({
                title: formatFieldName(fr.field),
                description: fr.reason,
                status: fr.status,
                icon: getSeverityIcon(fr.severity),
                evidence: fr.evidence,
                nextStep: fr.next_step,
            });
            eligibilityContainer.append(fieldCard);
        });
    }

    if (pdfResult.message) {
        addDetailRow(eligibilityContainer, "Requirements Extraction", pdfResult.message);
    }
}

// ── Extraction ────────────────────────────────────────────────────────────────
function renderExtraction(app) {
    if (!extractionContainer) return;
    extractionContainer.replaceChildren();

    const ext = app.resumeExtraction;
    if (!ext) {
        extractionContainer.append(
            createCard({ title: "No Resume Extraction", description: "Upload a resume PDF to extract fields.", status: "needs_review", icon: "ℹ️" })
        );
        return;
    }

    if (ext.status === "failed") {
        extractionContainer.append(
            createCard({ title: "Extraction Failed", description: ext.message || "Could not extract from resume.", status: "needs_review", icon: "⚠️" })
        );
        return;
    }

    if (ext.is_scanned) {
        extractionContainer.append(
            createCard({
                title: "Scanned Document Detected",
                description: "This document has no extractable text. OCR is required for automatic field extraction. Key fields cannot be verified.",
                status: "needs_review",
                icon: "📷",
                nextStep: "Convert your resume to a text-based PDF and re-upload.",
            })
        );
    }

    const fields   = ext.fields   || {};
    const evidence = ext.evidence || {};
    const FIELD_CONFIG = [
        ["cgpa",            "Extracted CGPA",       "📊"],
        ["sgpa",            "Extracted SGPA",       "📈"],
        ["graduation_year", "Graduation Year",      "🎓"],
        ["admission_year",  "Admission Year",       "🏛️"],
        ["academic_year",   "Academic Year",        "📅"],
    ];

    let found = false;
    FIELD_CONFIG.forEach(([key, label, icon]) => {
        const value = fields[key];
        if (value === null || value === undefined) return;
        found = true;
        const ev = evidence[key];
        extractionContainer.append(
            createCard({
                title: label,
                description: `Extracted value: ${value}`,
                status: "eligible",
                icon,
                evidence: ev ? `Page ${ev.page}: "${ev.matched_text}" — ${ev.text}` : null,
            })
        );
    });

    if (!found) {
        extractionContainer.append(
            createCard({
                title: "No Fields Detected",
                description: "No labelled CGPA, SGPA, graduation year, or admission year was found. Ensure your resume uses clear labels like 'CGPA: 8.5'.",
                status: "needs_review",
                icon: "ℹ️",
            })
        );
    }

    if (ext.note) {
        const noteEl = document.createElement("p");
        noteEl.style.cssText = "font-size: 12px; color: var(--muted); margin-top: 12px; padding: 10px; background: #ffffff06; border-radius: 6px;";
        noteEl.textContent = `ℹ️ ${ext.note}`;
        extractionContainer.append(noteEl);
    }
}

// ── Comparison ────────────────────────────────────────────────────────────────
function renderComparison(app) {
    if (!comparisonContainer) return;
    comparisonContainer.replaceChildren();

    const result = app.documentComparisonResult;
    if (!result) {
        comparisonContainer.append(
            createCard({ title: "No Comparison Data", description: "Upload both resume and marksheet as PDFs to enable comparison.", status: "needs_review" })
        );
        return;
    }

    if (result.message && !result.comparisons) {
        comparisonContainer.append(
            createCard({ title: "Comparison Not Available", description: result.message, status: "needs_review", icon: "ℹ️" })
        );
        return;
    }

    // Overall banner
    const overallCard = createCard({
        title: result.overall_status === "match"       ? "All compared fields match" :
               result.overall_status === "mismatch"    ? "Discrepancies detected between documents" :
               "Some fields need review",
        description: result.note || "",
        status: result.overall_status || "needs_review",
        icon: result.overall_status === "match" ? "✅" :
              result.overall_status === "mismatch" ? "❌" : "🔍",
    });
    comparisonContainer.append(overallCard);

    // Summary counts
    if (result.summary) {
        const s = result.summary;
        const summary = document.createElement("p");
        summary.style.cssText = "font-size: 13px; color: var(--muted); margin: 8px 0 16px;";
        summary.textContent =
            `${s.compared_fields || 0} fields compared: ` +
            `${s.matches || 0} match · ${s.mismatches || 0} mismatch · ${s.needs_review || 0} needs review`;
        comparisonContainer.append(summary);
    }

    // Per-field results — comparisons is an OBJECT not an array
    const comparisons = result.comparisons;
    if (comparisons && typeof comparisons === "object" && !Array.isArray(comparisons)) {
        Object.entries(comparisons).forEach(([fieldName, comp]) => {
            const fieldCard = createCard({
                title: formatFieldName(fieldName),
                description: comp.message || "",
                status: comp.status || "needs_review",
                icon: comp.status === "match" ? "✅" :
                      comp.status === "mismatch" ? "❌" : "🔍",
            });

            // Add value detail
            if (
                (comp.resume_value !== null && comp.resume_value !== undefined) ||
                (comp.marksheet_value !== null && comp.marksheet_value !== undefined)
            ) {
                const vals = document.createElement("p");
                vals.style.cssText = "font-size: 13px; color: var(--muted); margin-top: 6px;";
                vals.textContent = `Resume: ${comp.resume_value ?? "Not specified"} · Marksheet: ${comp.marksheet_value ?? "Not specified"}`;
                fieldCard.append(vals);
            }

            if (comp.status === "mismatch") {
                const ns = document.createElement("p");
                ns.style.cssText = "color: #f87171; font-size: 13px; margin-top: 6px;";
                ns.textContent = `→ Action required: Verify which value is correct and update the mismatching document.`;
                fieldCard.append(ns);
            } else if (comp.status === "needs_review" && comp.resume_value && comp.marksheet_value) {
                const ns = document.createElement("p");
                ns.style.cssText = "color: #f59e0b; font-size: 13px; margin-top: 6px;";
                ns.textContent = `→ Action: Review differing values or upload your latest semester transcript.`;
                fieldCard.append(ns);
            }

            comparisonContainer.append(fieldCard);
        });
    }
}

// ── Classification ────────────────────────────────────────────────────────────
function renderClassification(app) {
    const result = app.classificationResult;
    if (!result || !classificationSection || !classificationContainer) return;

    if (result.predicted_type === "unknown" && result.method === "unavailable") return;

    classificationSection.style.display = "";
    classificationContainer.replaceChildren();

    const confidence = Math.round((result.confidence || 0) * 100);
    const cls = createCard({
        title: `Detected document type: ${result.predicted_type || "Unknown"}`,
        description: `Confidence: ${confidence}% · Method: ${result.method || "heuristic"}${result.review_recommended ? " · Manual review recommended" : ""}`,
        status: result.review_recommended ? "needs_review" : "eligible",
        icon: "🔎",
    });
    classificationContainer.append(cls);

    if (result.note) {
        const noteEl = document.createElement("p");
        noteEl.style.cssText = "font-size: 12px; color: var(--muted); margin-top: 8px;";
        noteEl.textContent = `ℹ️ ${result.note}`;
        classificationContainer.append(noteEl);
    }
}

// ── Priority Issues ───────────────────────────────────────────────────────────
function renderPriorityIssues(app) {
    const issues = [];

    // Collect issues from eligibility
    const el = app.eligibilityResult;
    if (el) {
        if (el.status === "not_met" || el.status === "missing") {
            issues.push({
                severity: "high",
                title: el.status === "missing" ? "CGPA not found in resume" : "CGPA below requirement",
                description: el.reason,
                nextStep: el.field_results?.[0]?.next_step,
            });
        }
        // Check comprehensive field results
        const fieldResults = el.comprehensive?.field_results || el.field_results || [];
        fieldResults.forEach((fr) => {
            if (fr.status === "not_met" || fr.status === "missing") {
                issues.push({
                    severity: fr.severity || "medium",
                    title: `${formatFieldName(fr.field)}: ${fr.status === "missing" ? "Not Found" : "Not Met"}`,
                    description: fr.reason,
                    nextStep: fr.next_step,
                });
            }
        });
    }

    // Collect issues from comparison
    const comp = app.documentComparisonResult?.comparisons;
    if (comp && typeof comp === "object" && !Array.isArray(comp)) {
        Object.entries(comp).forEach(([field, c]) => {
            if (c.status === "mismatch") {
                issues.push({
                    severity: "high",
                    title: `Mismatch: ${formatFieldName(field)}`,
                    description: c.message,
                    nextStep: `Verify which value is correct. Resume: ${c.resume_value}, Marksheet: ${c.marksheet_value}.`,
                });
            }
        });
    }

    if (!issues.length || !issuesSection || !issuesList) return;

    // Sort by severity
    const ORDER = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (ORDER[a.severity] || 1) - (ORDER[b.severity] || 1));

    issuesSection.style.display = "";
    issuesList.replaceChildren();

    issues.forEach((issue, i) => {
        const card = createCard({
            title: `#${i + 1} ${issue.title}`,
            description: issue.description,
            status: issue.severity === "high" ? "not_met" : "needs_review",
            icon: getSeverityIcon(issue.severity),
            nextStep: issue.nextStep,
        });
        issuesList.append(card);
    });
}

// ── Internship Intelligence: Alignment & Dimensional Index ────────────────────
function renderInternshipAlignment(app) {
    const sec = document.getElementById("internshipAlignmentSection");
    const badge = document.getElementById("internshipBadge");
    const overview = document.getElementById("internshipAlignmentOverview");
    const dims = document.getElementById("internshipDimensions");
    if (!sec || !overview || !dims) return;

    const analysis = app.internshipAnalysis;
    if (!analysis) {
        sec.style.display = "none";
        return;
    }

    sec.style.display = "";

    const status = analysis.alignment_status || "moderate_alignment";
    const label = analysis.alignment_label || "Moderate Alignment";
    const index = analysis.alignment_index || 0;

    if (badge) {
        badge.className = `status-pill ${status}`;
        badge.textContent = label;
    }

    overview.innerHTML = `
        <div>
            <div class="alignment-stat-big">${index}%</div>
            <div class="alignment-label-text">${label}</div>
            <p class="muted" style="margin: 4px 0 0 0; font-size: 13px;">Calculated from required skill coverage, preferred stack overlap, and demonstrated experience evidence.</p>
        </div>
        <div style="text-align: right; max-width: 260px;">
            <span class="tag-tech">${escapeHtml(app.opportunityName || "Internship Role")}</span>
            <p class="muted" style="margin: 8px 0 0 0; font-size: 12px;">Objective measure of CV alignment against job requirements. Not a hiring guarantee.</p>
        </div>
    `;

    const d = analysis.dimensions || {};
    const reqCov = d.required_skills_coverage || { matched: 0, total: 0, percentage: 0 };
    const prefCov = d.preferred_skills_coverage || { matched: 0, total: 0, percentage: 0 };
    const expScore = d.experience_evidence_score || { demonstrated_count: 0, total_matched: 0, percentage: 0 };

    dims.innerHTML = `
        <div class="dim-card">
            <div class="dim-title">Required Skills Coverage</div>
            <div class="dim-val">${reqCov.matched} / ${reqCov.total} <span style="font-size:14px;color:var(--muted);font-weight:400">(${reqCov.percentage}%)</span></div>
            <div class="dim-progress-track">
                <div class="dim-progress-fill" style="width: ${reqCov.percentage}%"></div>
            </div>
        </div>
        <div class="dim-card">
            <div class="dim-title">Preferred Skills Coverage</div>
            <div class="dim-val">${prefCov.matched} / ${prefCov.total} <span style="font-size:14px;color:var(--muted);font-weight:400">(${prefCov.percentage}%)</span></div>
            <div class="dim-progress-track">
                <div class="dim-progress-fill" style="width: ${prefCov.percentage}%"></div>
            </div>
        </div>
        <div class="dim-card">
            <div class="dim-title">Experience &amp; Project Evidence</div>
            <div class="dim-val">${expScore.demonstrated_count} / ${expScore.total_matched || 1} <span style="font-size:14px;color:var(--muted);font-weight:400">(${expScore.percentage}%)</span></div>
            <div class="dim-progress-track">
                <div class="dim-progress-fill" style="width: ${expScore.percentage}%"></div>
            </div>
        </div>
    `;
}

// ── Internship Intelligence: Skills Evidence Matrix ───────────────────────────
function renderInternshipSkillsMatrix(app) {
    const sec = document.getElementById("internshipSkillsMatrixSection");
    const container = document.getElementById("internshipSkillsList");
    if (!sec || !container) return;

    const analysis = app.internshipAnalysis;
    if (!analysis || !Array.isArray(analysis.skills_matrix) || analysis.skills_matrix.length === 0) {
        sec.style.display = "none";
        return;
    }

    sec.style.display = "";
    container.innerHTML = "";

    analysis.skills_matrix.forEach((item) => {
        const card = document.createElement("div");
        card.className = "skill-card-item";

        let statusBadge = "";
        if (item.status === "verified by repository" || item.repository_verified) {
            statusBadge = `<span class="status-pill clean">✓ Verified by Repository</span>`;
        } else if (item.status === "supported by project evidence" || item.status === "demonstrated") {
            statusBadge = `<span class="status-pill strong_alignment">✓ Supported by Project Evidence</span>`;
        } else if (item.status === "mentioned") {
            statusBadge = `<span class="status-pill moderate_alignment">Mentioned Only</span>`;
        } else if (item.status === "unable to assess" || item.status === "unable_to_assess") {
            statusBadge = `<span class="status-pill unavailable">? Unable to Assess</span>`;
        } else {
            statusBadge = `<span class="status-pill significant_gaps">✕ Missing from CV</span>`;
        }

        const categoryBadge = `<span class="skill-category-badge">${item.category === "required" ? "Required Qualification" : "Preferred Qualification"}</span>`;

        let evidenceHtml = "";
        if (item.evidence) {
            evidenceHtml = `<div class="skill-evidence-quote">“${escapeHtml(item.evidence)}”</div>`;
        } else if (item.status === "missing") {
            evidenceHtml = `<p class="muted" style="margin: 6px 0 0 0; font-size: 13px;">Not found in your CV text. If you have coursework or project experience with this, add it truthfully to your skills or project bullets.</p>`;
        } else if (item.status === "unable to assess" || item.status === "unable_to_assess") {
            evidenceHtml = `<p class="muted" style="margin: 6px 0 0 0; font-size: 13px;">Unable to verify or assess this skill from provided materials.</p>`;
        } else {
            evidenceHtml = `<p class="muted" style="margin: 6px 0 0 0; font-size: 13px;">Found in skills list without supporting project bullets. See CV Improvement Lab below to substantiate it.</p>`;
        }

        card.innerHTML = `
            <div class="skill-card-top">
                <div>
                    <span class="skill-name">${escapeHtml(item.skill)}</span>
                    ${categoryBadge}
                </div>
                ${statusBadge}
            </div>
            ${evidenceHtml}
        `;
        container.append(card);
    });
}

// ── Proof-of-Skill (GitHub Inspection) ───────────────────────────────────────
function renderProofOfSkill(app) {
    const sec = document.getElementById("proofOfSkillSection");
    const badge = document.getElementById("proofOfSkillBadge");
    const container = document.getElementById("proofOfSkillDetails");
    if (!sec || !container) return;

    const pos = app.proofOfSkill;
    if (!pos || pos.status === "not_run" || !pos.repository) {
        sec.style.display = "";
        if (badge) {
            badge.className = "status-pill not_run";
            badge.textContent = "Not Run";
        }
        container.innerHTML = `
            <div class="dim-card" style="margin-bottom: 14px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                    ℹ️ <strong>Code Verification Not Run:</strong> No public GitHub repository URL was supplied for this application. ApplyReady AI never claims code is verified without independent static analysis. To verify hands-on code evidence, provide a public repository URL during submission.
                </p>
            </div>
        `;
        return;
    }

    if (pos.status === "unable_to_verify") {
        sec.style.display = "";
        if (badge) {
            badge.className = "status-pill unavailable";
            badge.textContent = "Unable to Verify";
        }
        container.innerHTML = `
            <div class="dim-card" style="margin-bottom: 14px;">
                <div style="margin-bottom: 8px;">
                    <strong>Repository:</strong> <a href="${escapeHtml(pos.repository)}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);text-decoration:underline;">${escapeHtml(pos.repository)}</a>
                </div>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #f87171;">
                    ⚠️ <strong>Inspection Incomplete:</strong> ${escapeHtml(pos.message || "GitHub API rate limit or repository access issue. Ensure repository is public and accessible.")}
                </p>
            </div>
        `;
        return;
    }

    sec.style.display = "";
    if (badge) {
        badge.className = `status-pill ${pos.status || "strong_alignment"}`;
        badge.textContent = (pos.status || "verified").replace(/_/g, " ");
    }

    container.innerHTML = "";

    const bd = pos.evidence_breakdown || {};
    const summaryCard = document.createElement("div");
    summaryCard.className = "dim-card";
    summaryCard.style.marginBottom = "14px";
    summaryCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
                <strong>Repository:</strong> <a href="${escapeHtml(pos.repository)}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);text-decoration:underline;">${escapeHtml(pos.owner)}/${escapeHtml(pos.repo)}</a>
            </div>
            <div class="muted" style="font-size:13px;">
                Verified Skills: <strong>${pos.verified_count || 0} / ${pos.total_claimed || 0}</strong>
            </div>
        </div>
        <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
            ${(pos.detected_languages || []).map(l => `<span class="tag-tech">${escapeHtml(l)}</span>`).join(" ")}
            ${(pos.manifests_analyzed || []).map(m => `<span class="tag-lab">${escapeHtml(m)}</span>`).join(" ")}
        </div>
        <div style="margin-top:8px; font-size:12px; color:var(--muted);">
            Evidence Categories: ${bd.implementation_count || 0} Implementation · ${bd.dependency_count || 0} Dependency · ${bd.test_count || 0} Test · ${bd.infrastructure_count || 0} Infrastructure
        </div>
    `;
    container.append(summaryCard);

    if (Array.isArray(pos.verified_skills) && pos.verified_skills.length > 0) {
        pos.verified_skills.forEach((v) => {
            const row = document.createElement("div");
            row.className = "skill-card-item";
            const isFound = v.status === "evidence_found";
            row.innerHTML = `
                <div class="skill-card-top">
                    <div>
                        <span class="skill-name">${escapeHtml(v.skill)}</span>
                        ${v.file_path ? `<span style="font-size:11px;color:#38bdf8;margin-left:8px;">[File: ${escapeHtml(v.file_path)}]</span>` : ""}
                    </div>
                    <span class="status-pill ${isFound ? "strong_alignment" : "moderate_alignment"}">${isFound ? "✓ Manifest Verified" : "Not in Manifest"}</span>
                </div>
                <p class="muted" style="margin:4px 0 0;font-size:13px;">${escapeHtml(v.evidence)}</p>
            `;
            container.append(row);
        });
    }
}

// ── Document Integrity & Tamper Risk ──────────────────────────────────────────
function renderDocumentIntegrity(app) {
    const sec = document.getElementById("documentIntegritySection");
    const badge = document.getElementById("integrityBadge");
    const container = document.getElementById("integrityDetails");
    if (!sec || !container) return;

    const integ = app.documentIntegrity;
    if (!integ) {
        sec.style.display = "none";
        return;
    }

    sec.style.display = "";
    if (badge) {
        badge.className = `status-pill ${integ.status}`;
        badge.textContent = integ.status_label || "No Obvious Anomalies";
    }

    container.innerHTML = "";

    const meta = integ.metadata_summary || {};
    const fonts = integ.font_summary || {};

    const metaGrid = document.createElement("div");
    metaGrid.className = "integrity-meta-grid";
    metaGrid.innerHTML = `
        <div><span class="muted">Software / Producer:</span><br><strong>${escapeHtml(meta.producer || "Unknown")}</strong></div>
        <div><span class="muted">Creator Application:</span><br><strong>${escapeHtml(meta.creator || "Unknown")}</strong></div>
        <div><span class="muted">Creation Timestamp:</span><br><strong>${escapeHtml(meta.creation_date || "Unknown")}</strong></div>
        <div><span class="muted">Modification Timestamp:</span><br><strong>${escapeHtml(meta.modification_date || "Unknown")}</strong></div>
        <div><span class="muted">Distinct Font Families:</span><br><strong>${fonts.distinct_families_count || 1} family</strong></div>
        <div><span class="muted">Pages Analyzed:</span><br><strong>${meta.page_count || 1} page(s)</strong></div>
    `;
    container.append(metaGrid);

    // Checks performed table
    if (Array.isArray(integ.checks_performed) && integ.checks_performed.length > 0) {
        const checkList = document.createElement("div");
        checkList.style.marginTop = "14px";
        integ.checks_performed.forEach(c => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#ffffff05;border-radius:6px;margin-bottom:6px;font-size:13px;";
            const isClean = c.status === "clean" || c.status === "evaluated" || c.status === "normal" || c.status === "selectable_text_present";
            const pillClass = isClean ? "strong_alignment" : (c.status === "unavailable" ? "moderate_alignment" : "significant_gaps");
            row.innerHTML = `
                <div>
                    <strong>${escapeHtml(c.title)}</strong>
                    <div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(c.detail)}</div>
                </div>
                <span class="status-pill ${pillClass}">${escapeHtml((c.status || "").replace(/_/g, " "))}</span>
            `;
            checkList.append(row);
        });
        container.append(checkList);
    }

    if (Array.isArray(integ.anomalies) && integ.anomalies.length > 0) {
        integ.anomalies.forEach((a) => {
            const anomEl = document.createElement("div");
            anomEl.className = "integrity-anomaly-card";
            anomEl.innerHTML = `
                <strong>ℹ️ ${escapeHtml((a.category || a.type).replace(/_/g, " ").toUpperCase())}</strong>
                <p style="margin: 4px 0 0 0; line-height: 1.5;">${escapeHtml(a.description)}</p>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Automated formatting / ATS signal. Does not indicate document tampering.</div>
            `;
            container.append(anomEl);
        });
    }

    if (meta.metadata_note) {
        const noteEl = document.createElement("p");
        noteEl.className = "muted";
        noteEl.style.cssText = "font-size:12px;margin-top:10px;font-style:italic;";
        noteEl.textContent = `ℹ️ ${meta.metadata_note}`;
        container.append(noteEl);
    }
}

// ── CV Improvement Lab ────────────────────────────────────────────────────────
function renderCvImprovementLab(app) {
    const sec = document.getElementById("cvImprovementLabSection");
    const container = document.getElementById("cvSuggestionsList");
    const copyBtn = document.getElementById("copyAcceptedBulletsBtn");
    const rerunBtn = document.getElementById("rerunCvAnalysisBtn");
    const impactCard = document.getElementById("beforeAfterImpactCard");
    if (!sec || !container) return;

    sec.style.display = "";

    const suggestions = app.cvSuggestions || app.internshipAnalysis?.suggestions || [];
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = `
            <div class="dim-card" style="padding:16px 20px;color:#94a3b8;font-size:14px;">
                ✓ <strong>No Optimization Required:</strong> Your CV bullet points already provide sufficient context and active evidence for the detected skills, or no direct rewrite opportunities were identified.
            </div>
        `;
        if (rerunBtn) rerunBtn.style.display = "none";
        if (copyBtn) copyBtn.style.display = "none";
        return;
    }

    container.innerHTML = "";

    // Render Before & After card if analysis was rerun
    if (app.beforeAfterComparison && impactCard) {
        const bac = app.beforeAfterComparison;
        impactCard.style.display = "";
        impactCard.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(0,229,163,0.12), rgba(30,41,59,0.5));border:1px solid #00e5a350;border-radius:10px;padding:16px 20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <span class="status-pill strong_alignment">⚡ Optimization Impact Verified</span>
                        <h3 style="margin:8px 0 4px;font-size:16px;color:#fff;">CV Revisions Successfully Applied</h3>
                        <p class="muted" style="margin:0;font-size:13px;">${bac.accepted_bullets_count} accepted bullet point(s) integrated into analysis.</p>
                    </div>
                    <div style="display:flex;gap:16px;text-align:right;">
                        <div>
                            <div class="muted" style="font-size:12px;">Technical Alignment</div>
                            <div style="font-size:20px;font-weight:700;color:#00e5a3;">${bac.before_alignment_index}% → ${bac.after_alignment_index}% <span style="font-size:13px;font-weight:400;">(+${bac.delta_alignment}%)</span></div>
                        </div>
                        <div>
                            <div class="muted" style="font-size:12px;">Evidence Grounding</div>
                            <div style="font-size:20px;font-weight:700;color:#38bdf8;">${bac.before_evidence_score}% → ${bac.after_evidence_score}% <span style="font-size:13px;font-weight:400;">(+${bac.delta_evidence}%)</span></div>
                        </div>
                    </div>
                </div>
                ${Array.isArray(bac.upgraded_skills) && bac.upgraded_skills.length > 0 ? `
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-size:13px;">
                        <strong>Upgraded to Demonstrated Context:</strong> ${bac.upgraded_skills.map(s => `<span class="tag-tech" style="background:#00e5a320;color:#00e5a3;margin-left:4px;">${escapeHtml(s)}</span>`).join(" ")}
                    </div>
                ` : ""}
            </div>
        `;
    }

    const updateRerunButtonVisibility = () => {
        const acceptedCount = suggestions.filter(s => s.status === "accepted").length;
        if (rerunBtn) {
            rerunBtn.style.display = acceptedCount > 0 ? "" : "none";
            rerunBtn.textContent = `⚡ Rerun Analysis with ${acceptedCount} Accepted Bullet${acceptedCount === 1 ? "" : "s"}`;
        }
        if (copyBtn) {
            copyBtn.style.display = "";
        }
    };

    updateRerunButtonVisibility();

    suggestions.forEach((sug) => {
        const card = document.createElement("div");
        card.className = `cv-sug-card status-${sug.status || "pending"}`;
        card.id = `card_${sug.id}`;

        const isAccepted = sug.status === "accepted";
        const isRejected = sug.status === "rejected";

        card.innerHTML = `
            <div class="cv-sug-header">
                <div>
                    <span class="tag-lab">${escapeHtml((sug.type || "rewrite").replace(/_/g, " "))}</span>
                    <span style="font-weight:600;margin-left:8px;font-size:14px;">${escapeHtml(sug.target_skill || "CV Bullet")}</span>
                </div>
                <span class="status-pill ${isAccepted ? "strong_alignment" : (isRejected ? "significant_gaps" : "moderate_alignment")}" id="badge_${sug.id}">
                    ${isAccepted ? "Accepted" : (isRejected ? "Rejected" : "Pending Review")}
                </span>
            </div>
            <div class="cv-sug-reason">💡 ${escapeHtml(sug.reason || "")}</div>
            <div class="bullet-diff-box">
                <div class="bullet-orig"><strong>Original:</strong> ${escapeHtml(sug.original_snippet || "Current wording")}</div>
                <div class="bullet-revised"><strong>Suggested:</strong> ${escapeHtml(sug.suggested_bullet || "")}</div>
            </div>
            ${sug.information_request ? `
                <div style="margin:8px 0;padding:8px 12px;background:rgba(56,189,248,0.08);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;color:#cbd5e1;line-height:1.4;">
                    📋 <strong>Information Request:</strong> ${escapeHtml(sug.information_request)}
                </div>
            ` : ""}
            ${sug.non_quantified_alternative ? `
                <div style="margin:6px 0;padding:6px 10px;background:#ffffff05;border-radius:4px;font-size:12px;color:#94a3b8;line-height:1.4;">
                    ⚖️ <strong>Honest Non-Quantified Option:</strong> ${escapeHtml(sug.non_quantified_alternative)}
                </div>
            ` : ""}
            ${sug.metric_guidance ? `<div style="margin:6px 0 10px;padding:6px 10px;background:#ffffff05;border-radius:4px;font-size:12px;color:#94a3b8;line-height:1.4;">📊 <em>${escapeHtml(sug.metric_guidance)}</em></div>` : ""}
            <div class="cv-action-btns">
                <button type="button" class="btn-reject btn-sm" onclick="handleSuggestionAction('${app.id || app.applicationId}', '${sug.id}', 'rejected')">✕ Reject</button>
                <button type="button" class="btn-accept btn-sm" onclick="handleSuggestionAction('${app.id || app.applicationId}', '${sug.id}', 'accepted')">✓ Accept Suggestion</button>
            </div>
        `;
        container.append(card);
    });

    if (copyBtn) {
        copyBtn.onclick = () => {
            const accepted = suggestions.filter(s => s.status === "accepted");
            if (accepted.length === 0) {
                alert("No bullets accepted yet. Accept suggestions using the '✓ Accept Suggestion' button first!");
                return;
            }
            const textToCopy = accepted.map(s => `• ${s.suggested_bullet}`).join("\n\n");
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = "✓ Copied to Clipboard!";
                setTimeout(() => { copyBtn.textContent = originalText; }, 2500);
            });
        };
    }

    if (rerunBtn) {
        rerunBtn.onclick = async () => {
            const accepted = suggestions.filter(s => s.status === "accepted");
            if (accepted.length === 0) return;

            rerunBtn.disabled = true;
            rerunBtn.textContent = "⏳ Re-evaluating alignment...";

            try {
                const appId = app.id || app.applicationId;
                const res = await apiFetch(`/api/applications/${encodeURIComponent(appId)}/rerun-cv-analysis`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        acceptedSuggestions: suggestions,
                        beforeAlignmentIndex: app.internshipAnalysis?.alignment_index || 0,
                        beforeEvidenceScore: app.internshipAnalysis?.dimensions?.experience_evidence_score?.percentage || 0,
                        jdText: app.requirementsText || app.opportunityName,
                        opportunityName: app.opportunityName,
                    }),
                });

                if (res.status === "ok") {
                    app.internshipAnalysis = res.internshipAnalysis;
                    app.beforeAfterComparison = res.beforeAfterComparison;
                    app.acceptedRevisions = res.acceptedRevisions || app.acceptedRevisions;
                    app.originalCvText = res.originalCvText || app.originalCvText;
                    app.revisedCvText = res.revisedCvText || app.revisedCvText;
                    saveApplication(app);

                    // Re-render UI components
                    renderInternshipAlignment(app);
                    renderInternshipSkillsMatrix(app);
                    renderOverallStatus(app);
                    renderCvImprovementLab(app);
                    loadGenAI(app);
                } else {
                    alert("Rerun failed: " + (res.error || "Unknown error"));
                }
            } catch (err) {
                alert("Could not rerun analysis: " + err.message);
            } finally {
                rerunBtn.disabled = false;
                updateRerunButtonVisibility();
            }
        };
    }
}

window.handleSuggestionAction = async function(appId, sugId, newStatus) {
    const card = document.getElementById(`card_${sugId}`);
    const badge = document.getElementById(`badge_${sugId}`);
    const rerunBtn = document.getElementById("rerunCvAnalysisBtn");

    if (card) {
        card.className = `cv-sug-card status-${newStatus}`;
    }
    if (badge) {
        badge.className = `status-pill ${newStatus === "accepted" ? "strong_alignment" : "significant_gaps"}`;
        badge.textContent = newStatus === "accepted" ? "Accepted" : "Rejected";
    }

    // Update in application session
    const list = application.cvSuggestions || application.internshipAnalysis?.suggestions || [];
    const found = list.find(s => s.id === sugId);
    if (found) {
        found.status = newStatus;
        application.cvSuggestions = list;
        saveApplication(application);
    }

    const acceptedCount = list.filter(s => s.status === "accepted").length;
    if (rerunBtn) {
        rerunBtn.style.display = acceptedCount > 0 ? "" : "none";
        rerunBtn.textContent = `⚡ Rerun Analysis with ${acceptedCount} Accepted Bullet${acceptedCount === 1 ? "" : "s"}`;
    }

    // Persist to backend if possible
    try {
        await apiFetch(`/api/applications/${encodeURIComponent(appId)}/cv-suggestions/${encodeURIComponent(sugId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });
    } catch (e) {
        console.warn("Could not persist suggestion action to backend:", e.message);
    }
};


// ── Overall Status Bar ────────────────────────────────────────────────────────
function renderOverallStatus(app) {
    if (!statusBar || !statusBarLabel || !statusBarIcon || !statusBarReason) return;

    if (app.domain === "internship") {
        const analysis = app.internshipAnalysis;
        let cfg = { label: "Technical Alignment Pending", color: "#ffb800", bg: "#ffb80015", icon: "📋" };
        let reason = "Internship intelligence analysis in progress.";
        if (analysis) {
            if (analysis.alignment_status === "strong_alignment") {
                cfg = { label: `Strong Alignment (${analysis.alignment_index}%)`, color: "#00e5a3", bg: "#00e5a315", icon: "✓" };
                reason = "Your CV evidence strongly matches the required technical stack.";
            } else if (analysis.alignment_status === "moderate_alignment") {
                cfg = { label: `Moderate Alignment (${analysis.alignment_index}%)`, color: "#ffb800", bg: "#ffb80015", icon: "⚠️" };
                reason = "Moderate overlap with required skills. Review the CV Improvement Lab suggestions below.";
            } else {
                cfg = { label: `Skill Gaps Identified (${analysis.alignment_index}%)`, color: "#ff4d6d", bg: "#ff4d6d15", icon: "✕" };
                reason = "Key required skills appear to be absent or unevidenced in your CV.";
            }
        }
        statusBar.classList.remove("hidden");
        statusBar.style.cssText = `
            display: flex; align-items: center; gap: 16px;
            padding: 18px 24px; border-radius: 12px;
            background: ${cfg.bg}; border: 1px solid ${cfg.color}44;
            margin-bottom: 28px;
        `;
        statusBarIcon.textContent = cfg.icon;
        statusBarIcon.style.fontSize = "28px";
        statusBarLabel.textContent = cfg.label;
        statusBarLabel.style.color = cfg.color;
        statusBarReason.textContent = reason;
        return;
    }

    const el = app.eligibilityResult;
    if (!el) return;

    const cfg = getStatusConfig(el.status || "needs_review");
    statusBar.classList.remove("hidden");
    statusBar.style.cssText = `
        display: flex; align-items: center; gap: 16px;
        padding: 18px 24px; border-radius: 12px;
        background: ${cfg.bg}; border: 1px solid ${cfg.color}44;
        margin-bottom: 28px;
    `;
    statusBarIcon.textContent = cfg.icon;
    statusBarIcon.style.fontSize = "28px";
    statusBarLabel.textContent = cfg.label;
    statusBarLabel.style.color = cfg.color;
    statusBarReason.textContent = el.reason || "";
}

// ── GenAI Explanation ─────────────────────────────────────────────────────────
async function loadGenAI(app) {
    if (!genaiSection || !genaiContent) return;

    genaiSection.style.display = "";

    const el = app.eligibilityResult;
    if (!el && !app.internshipAnalysis) {
        genaiContent.innerHTML = "<p class='muted'>No verification result to explain.</p>";
        return;
    }

    const payload = {
        applicationId: app.id || app.applicationId,
        opportunity_name: app.opportunityName || "Unknown Opportunity",
        domain: app.domain || "scholarship",
        eligibility_result: el || {},
        field_results: el?.comprehensive?.field_results || el?.field_results || [],
        comparison_result: app.documentComparisonResult || null,
        requirements_text: app.requirementsText || null,
        internship_analysis: app.internshipAnalysis || null,
        proof_of_skill: app.proofOfSkill || null,
        document_integrity: app.documentIntegrity || null,
    };

    try {
        let data;
        try {
            data = await apiFetch("/api/genai-explain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, 20000);
        } catch (backendErr) {
            // Direct ML service fallback only in local development if backend proxy fails
            const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
            if (isLocal) {
                try {
                    const directResp = await fetch("http://localhost:8000/genai-explain", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(15000),
                    });
                    if (directResp.ok) {
                        data = await directResp.json();
                    }
                } catch {
                    // Ignore direct local failure and provide graceful advisory
                }
            }
            if (!data) {
                data = {
                    available: false,
                    text: null,
                    method: "unavailable",
                    note: "AI Assistant Guidance is temporarily unavailable. Your core assessment and verification findings are fully preserved."
                };
            }
        }

        if (data.available && data.text) {
            app.genaiExplanation = data;
            saveApplication(app);
            genaiContent.innerHTML = `
                <div class="genai-rendered-body" style="line-height: 1.8; color: #c8d0e0; font-size: 14px;">
                    ${renderMarkdown(data.text)}
                </div>
            `;

            const disc = document.createElement("p");
            disc.style.cssText = "font-size: 12px; color: var(--muted); margin-top: 12px; font-style: italic;";
            disc.textContent = `Generated by ${data.model || "Gemini"} · This is an automated assessment suggestion, not an official decision.`;
            genaiContent.append(disc);
        } else {
            const note = data.note || "AI explanations are not available (API key not configured).";
            genaiContent.innerHTML = `<p class="muted" style="font-size:14px;">ℹ️ ${note}</p>`;
        }
    } catch (err) {
        genaiContent.innerHTML = `<p class="muted" style="font-size:14px;">ℹ️ AI suggestions unavailable: ${err.message && err.message.includes("AbortError") ? "Timed out." : (err.message || "Service offline")}</p>`;
    }
}

// ── Download Report ───────────────────────────────────────────────────────────
downloadBtn && downloadBtn.addEventListener("click", () => {
    if (!application) return;
    // Save current session data and redirect to report page
    saveApplication(application); // ensure fresh save
    const appId = application.id || application.applicationId;
    window.location.href = appId ? `report.html?id=${encodeURIComponent(appId)}` : "report.html";
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDetailRow(container, label, value) {
    const row = document.createElement("div");
    row.style.cssText = "padding: 8px 0; border-bottom: 1px solid #ffffff08; font-size: 14px;";
    row.innerHTML = `<span style="color:var(--muted)">${label}:</span> <span style="color:#d0d8ea; margin-left: 8px;">${
        value === null || value === undefined || value === "" ? "Not available" : String(value)
    }</span>`;
    container.append(row);
}
