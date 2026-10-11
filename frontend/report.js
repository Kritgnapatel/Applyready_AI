"use strict";

// Guard: Require login before viewing report
if (typeof requirePageAuth === "function") {
    requirePageAuth();
}

(async function initReport() {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get("id");
    let app = typeof loadApplication === "function" ? loadApplication() : null;

    if (appId && (!app || (app.id !== appId && app.appId !== appId))) {
        try {
            const detail = await apiFetch(`/api/applications/${encodeURIComponent(appId)}`);
            if (detail && detail.application) {
                app = {
                    ...detail.application,
                    id: detail.application.appId || detail.application.id,
                    ...(detail.latestAssessment || {}),
                };
                if (typeof saveApplication === "function") {
                    saveApplication(app);
                }
            }
        } catch (e) {
            console.warn("Could not fetch application from API:", e);
        }
    }

    if (!app) {
        document.body.innerHTML = `
            <div style="padding: 60px; text-align: center; font-family: sans-serif;">
                <h2 style="color:#f8fafc;">No report data found.</h2>
                <p style="color:#94a3b8;margin:12px 0 24px;">Please launch an assessment from the dashboard or provide a valid application ID.</p>
                <p><a href="dashboard.html" style="color:#00e5a3;font-weight:600;text-decoration:underline;">← Back to Dashboard</a></p>
            </div>`;
        return;
    }

    renderReport(app);
})();

function renderReport(app) {
    const now = new Date();
    const ts = now.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
    const el = (id) => document.getElementById(id);

    // Meta & Title
    if (el("reportTimestamp")) el("reportTimestamp").textContent = ts;
    if (el("reportMeta")) {
        el("reportMeta").textContent =
            `Assessment ID: ${app.id || app.applicationId || "—"} · Generated: ${ts}`;
    }

    const isInternship = app.domain === "internship";

    if (el("rReportTitle")) {
        el("rReportTitle").innerHTML = isInternship
            ? `ApplyReady <span>AI</span> — Internship Intelligence &amp; Readiness Report`
            : `ApplyReady <span>AI</span> — Scholarship Verification Report`;
    }

    // Opportunity Details
    const DOMAIN_LABELS = { scholarship: "Scholarship Verification", internship: "Internship Intelligence" };
    if (el("rDomain")) el("rDomain").textContent = DOMAIN_LABELS[app.domain] || app.domain || "—";
    if (el("rName")) el("rName").textContent   = app.opportunityName || "—";
    if (el("rUrl")) el("rUrl").textContent    = app.officialUrl || "Not provided";

    // Executive Summary
    renderExecutiveSummary(app, el("rExecutiveSummary"));

    if (isInternship) {
        // Hide Scholarship-specific sections completely
        if (el("rEligibilitySection")) el("rEligibilitySection").style.display = "none";
        if (el("rExtractionSection")) el("rExtractionSection").style.display = "none";
        if (el("rComparisonSection")) el("rComparisonSection").style.display = "none";
        if (el("rClassificationSection")) el("rClassificationSection").style.display = "none";
        if (el("rIssuesSection")) el("rIssuesSection").style.display = "none";

        // Render Internship Intelligence sections
        renderInternshipReportAlignment(app, el("rInternshipAlignment"), el("rInternshipAlignmentSection"));
        renderBeforeAfterReport(app, el("rBeforeAfter"), el("rBeforeAfterSection"));
        renderInternshipReportSkills(app, el("rInternshipSkills"), el("rInternshipSkillsSection"));
        renderReportProofOfSkill(app, el("rProofOfSkill"), el("rProofOfSkillSection"));
        renderReportCvLab(app, el("rCvLab"), el("rCvLabSection"));
        renderInternshipNextSteps(app, el("rInternshipNextSteps"), el("rInternshipNextStepsSection"));
        renderReportIntegrity(app, el("rIntegrity"), el("rIntegritySection"));
        renderGenai(app, el("rGenai"), el("rGenaiSection"));
    } else {
        // Hide Internship-specific sections completely
        if (el("rInternshipAlignmentSection")) el("rInternshipAlignmentSection").style.display = "none";
        if (el("rBeforeAfterSection")) el("rBeforeAfterSection").style.display = "none";
        if (el("rInternshipSkillsSection")) el("rInternshipSkillsSection").style.display = "none";
        if (el("rProofOfSkillSection")) el("rProofOfSkillSection").style.display = "none";
        if (el("rCvLabSection")) el("rCvLabSection").style.display = "none";
        if (el("rInternshipNextStepsSection")) el("rInternshipNextStepsSection").style.display = "none";

        // Render Scholarship Verification sections
        if (el("rEligibilitySection")) el("rEligibilitySection").style.display = "";
        if (el("rExtractionSection")) el("rExtractionSection").style.display = "";
        if (el("rComparisonSection")) el("rComparisonSection").style.display = "";
        if (el("rClassificationSection")) el("rClassificationSection").style.display = "";
        if (el("rIssuesSection")) el("rIssuesSection").style.display = "";

        renderEligibility(app, el("rEligibility"));
        renderExtraction(app, el("rExtraction"));
        renderComparison(app, el("rComparison"));
        renderClassification(app, el("rClassification"), el("rClassificationSection"));
        renderReportIntegrity(app, el("rIntegrity"), el("rIntegritySection"));
        renderIssues(app, el("rIssues"));
        renderGenai(app, el("rGenai"), el("rGenaiSection"));
    }
}

function statusLabel(status) {
    return {
        eligible: "✅ Eligible",
        not_met: "❌ Not Met",
        missing: "⚠ Missing",
        needs_review: "🔍 Needs Review",
        "verified by repository": "✓ Verified by Repository",
        "supported by project evidence": "✓ Supported by Project Evidence",
        demonstrated: "✓ Supported by Project Evidence",
        mentioned: "🟡 Mentioned Only",
        "unable to assess": "🔍 Unable to Assess",
    }[status] || status;
}

// ── Executive Summary ────────────────────────────────────────────────────────
function renderExecutiveSummary(app, container) {
    if (!container) return;

    if (app.domain === "internship") {
        const analysis = app.internshipAnalysis;
        const index = analysis?.alignment_index ?? "—";
        const label = analysis?.alignment_label || "Alignment In Progress";
        const d = analysis?.dimensions || {};
        const req = d.required_skills_coverage || { matched: 0, total: 0, percentage: 0 };
        const pos = app.proofOfSkill;
        const integ = app.documentIntegrity;
        const bac = app.beforeAfterComparison;

        const posStatusText = (!pos || pos.status === "not_run" || !pos.repository)
            ? "Not run (no repository URL provided)"
            : (pos.status === "unable_to_verify")
            ? `Unable to verify (${pos.message || "access issue"})`
            : `Verified ${pos.verified_count || 0}/${pos.total_claimed || 0} skills in ${pos.owner}/${pos.repo}`;

        container.innerHTML = `
            <div style="background:#ffffff06;border-left:4px solid var(--cyan);padding:16px 20px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="font-size:17px;color:#f8fafc;">Role Alignment: ${index}% — ${escapeHtml(label)}</strong>
                        <p class="muted" style="margin:4px 0 0;font-size:13px;line-height:1.5;">
                            Candidate matched <strong>${req.matched} of ${req.total}</strong> required qualification(s) (${req.percentage}%) against the Job Description.
                        </p>
                    </div>
                    <div>
                        <span class="status-pill ${analysis?.alignment_status || 'moderate_alignment'}">${escapeHtml(label)}</span>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid #ffffff10;font-size:13px;">
                    <div><strong>GitHub Proof-of-Skill:</strong><br><span class="muted">${escapeHtml(posStatusText)}</span></div>
                    <div><strong>Document Integrity:</strong><br><span class="muted">${integ?.status === 'no_obvious_anomaly_detected' ? 'Clean technical PDF structure' : (integ?.status_label || 'Evaluated')}</span></div>
                    <div><strong>CV Optimization:</strong><br><span class="muted">${bac ? `Rerun applied: ${bac.delta_alignment >= 0 ? '+' : ''}${bac.delta_alignment}% alignment gain` : 'Initial baseline analysis'}</span></div>
                </div>
            </div>
        `;
    } else {
        const el = app.eligibilityResult;
        const comp = app.documentComparisonResult;
        const status = el?.status || "needs_review";

        container.innerHTML = `
            <div style="background:#ffffff06;border-left:4px solid var(--primary);padding:16px 20px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="font-size:17px;color:#f8fafc;">Eligibility Verdict: ${statusLabel(status)}</strong>
                        <p class="muted" style="margin:4px 0 0;font-size:13px;line-height:1.5;">${escapeHtml(el?.reason || "Academic verification performed.")}</p>
                    </div>
                    <div>
                        <span class="status-pill ${status}">${statusLabel(status)}</span>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid #ffffff10;font-size:13px;">
                    <div><strong>CGPA Verification:</strong><br><span class="muted">Your CGPA: ${el?.actual_value ?? '—'} (Req: ${el?.required_value ?? 'None'})</span></div>
                    <div><strong>Document Consistency:</strong><br><span class="muted">Status: ${statusLabel(comp?.overall_status || 'needs_review')}</span></div>
                    <div><strong>Uploaded Packet:</strong><br><span class="muted">${(app.files || []).map(f => f.field).join(', ') || 'PDF Packet uploaded'}</span></div>
                </div>
            </div>
        `;
    }
}

// ── Internship: Role Alignment & Dimensional Index ───────────────────────────
function renderInternshipReportAlignment(app, container, section) {
    const analysis = app.internshipAnalysis;
    if (!analysis || !container) return;
    if (section) section.style.display = "";

    const d = analysis.dimensions || {};
    const req = d.required_skills_coverage || { matched: 0, total: 0, percentage: 0 };
    const pref = d.preferred_skills_coverage || { matched: 0, total: 0, percentage: 0 };
    const exp = d.experience_evidence_score || { demonstrated_count: 0, total_matched: 0, percentage: 0 };
    const meth = analysis.scoring_methodology || {};
    const weights = meth.weights || { required_skills_coverage: 0.6, experience_evidence_score: 0.25, preferred_skills_coverage: 0.15 };
    const contrib = meth.contribution_points || {};

    const reqPts = contrib.required_skills_pts ?? (req.percentage * (weights.required_skills_coverage || 0.6) / 100 * 100).toFixed(1);
    const expPts = contrib.experience_evidence_pts ?? (exp.percentage * (weights.experience_evidence_score || 0.25) / 100 * 100).toFixed(1);
    const prefPts = contrib.preferred_skills_pts ?? (pref.percentage * (weights.preferred_skills_coverage || 0.15) / 100 * 100).toFixed(1);

    container.innerHTML = `
        <table class="report-table">
            <tr>
                <td>Overall Technical Alignment Index</td>
                <td><strong>${analysis.alignment_index}%</strong> <span class="status-pill ${analysis.alignment_status || 'moderate_alignment'}">${escapeHtml(analysis.alignment_label)}</span></td>
            </tr>
            <tr>
                <td>Required Skills Coverage (${Math.round((weights.required_skills_coverage || 0.6) * 100)}% Weight)</td>
                <td>
                    <strong>${req.matched} / ${req.total} (${req.percentage}%)</strong> → Contribution: <strong>${reqPts} pts</strong>
                    <br><span style="font-size:12px;color:var(--muted);">Measures presence of mandatory job qualifications in CV or repository.</span>
                </td>
            </tr>
            <tr>
                <td>Experience Evidence Grounding (${Math.round((weights.experience_evidence_score || 0.25) * 100)}% Weight)</td>
                <td>
                    <strong>${exp.demonstrated_count} / ${exp.total_matched || 1} (${exp.percentage}%)</strong> → Contribution: <strong>${expPts} pts</strong>
                    <br><span style="font-size:12px;color:var(--muted);">Measures proportion of matched skills supported by active project context or verified in repository code.</span>
                </td>
            </tr>
            <tr>
                <td>Preferred Skills Coverage (${Math.round((weights.preferred_skills_coverage || 0.15) * 100)}% Weight)</td>
                <td>
                    <strong>${pref.matched} / ${pref.total || 1} (${pref.percentage}%)</strong> → Contribution: <strong>${prefPts} pts</strong>
                    <br><span style="font-size:12px;color:var(--muted);">Measures presence of bonus or preferred technologies.</span>
                </td>
            </tr>
            <tr>
                <td>Missing Mandatory Qualifications</td>
                <td>${analysis.missing_required_skills?.length ? `<span style="color:#f43f5e;font-weight:600;">${escapeHtml(analysis.missing_required_skills.join(", "))}</span>` : "<span style=\"color:#00e5a3;font-weight:600;\">None — 100% mandatory qualifications matched</span>"}</td>
            </tr>
        </table>

        <div style="background:#ffffff05;border-radius:6px;padding:12px 16px;margin-top:12px;font-size:12px;line-height:1.6;color:#94a3b8;">
            <strong style="color:#f8fafc;">Calculation Formula &amp; Diagnostic Methodology:</strong><br>
            <code>Formula: Index = ${escapeHtml(meth.formula || "60% × Required Coverage + 25% × Evidence Grounding + 15% × Preferred Coverage")}</code><br>
            The Technical Alignment Index measures qualification overlap and contextual evidence grounding. It is an objective diagnostic tool for applicant preparation, not a hiring decision or recruitment guarantee.
        </div>
    `;
}

// ── Internship: Before & After Optimization ──────────────────────────────────
function renderBeforeAfterReport(app, container, section) {
    const bac = app.beforeAfterComparison;
    if (!bac || !container) {
        if (section) section.style.display = "none";
        return;
    }
    if (section) section.style.display = "";

    container.innerHTML = `
        <table class="report-table">
            <tr><td>Accepted Bullets Integrated</td><td><strong>${bac.accepted_bullets_count} revision(s)</strong> incorporated from CV Improvement Lab</td></tr>
            <tr><td>Technical Alignment Index</td><td><strong>${bac.before_alignment_index}% → ${bac.after_alignment_index}%</strong> (${bac.delta_alignment >= 0 ? '+' : ''}${bac.delta_alignment}%)</td></tr>
            <tr><td>Experience Evidence Score</td><td><strong>${bac.before_evidence_score}% → ${bac.after_evidence_score}%</strong> (${bac.delta_evidence >= 0 ? '+' : ''}${bac.delta_evidence}%)</td></tr>
            <tr><td>Upgraded to Evidence-Grounded</td><td>${Array.isArray(bac.upgraded_skills) && bac.upgraded_skills.length ? escapeHtml(bac.upgraded_skills.join(", ")) : "All existing skills maintained context"}</td></tr>
        </table>
        <p style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic;">
            Rerun analysis incorporates candidate-accepted CV improvement bullets, providing measurable before/after coverage verification.
        </p>
    `;
}

// ── Internship: Categorized Skills Matrix (5-Tier Status Hierarchy) ───────────
function renderInternshipReportSkills(app, container, section) {
    const analysis = app.internshipAnalysis;
    if (!analysis || !analysis.skills_matrix || !container) return;
    if (section) section.style.display = "";

    const verifiedByRepo = analysis.skills_matrix.filter(s => s.status === "verified by repository" || s.repository_verified);
    const supportedByProject = analysis.skills_matrix.filter(s => (s.status === "supported by project evidence" || s.status === "demonstrated") && !s.repository_verified);
    const mentionedOnly = analysis.skills_matrix.filter(s => s.status === "mentioned");
    const missingSkills = analysis.skills_matrix.filter(s => s.status === "missing");
    const unableToAssess = analysis.skills_matrix.filter(s => s.status === "unable to assess" || s.status === "unable_to_assess");

    const renderSkillRow = (s, statusHtml) => `
        <tr>
            <td>
                <strong>${escapeHtml(s.skill)}</strong>
                <span style="font-size:11px;color:var(--muted);margin-left:6px;">(${s.category === 'required' ? 'Mandatory' : 'Preferred'})</span>
            </td>
            <td>
                ${statusHtml}
                ${s.evidence ? `<br><em style="font-size:12px;color:#cbd5e1;line-height:1.4;display:block;margin-top:3px;">"${escapeHtml(s.evidence)}"</em>` : ""}
            </td>
        </tr>
    `;

    const repoRows = verifiedByRepo.map(s => renderSkillRow(s, '<span class="status-pill clean">✓ Verified by Repository</span>')).join("");
    const projectRows = supportedByProject.map(s => renderSkillRow(s, '<span class="status-pill strong_alignment">✓ Supported by Project Evidence</span>')).join("");
    const mentionedRows = mentionedOnly.map(s => renderSkillRow(s, '<span class="status-pill moderate_alignment">Mentioned Only — Needs Project Evidence</span>')).join("");
    const missingRows = missingSkills.map(s => renderSkillRow(s, '<span class="status-pill significant_gaps">✕ Missing from CV</span>')).join("");
    const unableRows = unableToAssess.map(s => renderSkillRow(s, '<span class="status-pill unavailable">? Unable to Assess</span>')).join("");

    container.innerHTML = `
        <table class="report-table">
            <tr class="section-row"><td colspan="2"><strong>1. Verified by Repository (Manifest / Code Inspection) — ${verifiedByRepo.length}</strong></td></tr>
            ${repoRows || '<tr><td colspan="2" class="muted">No repository verification run, or no skills detected in repository manifests.</td></tr>'}

            <tr class="section-row"><td colspan="2"><strong>2. Supported by Project Evidence (Active CV Bullet Context) — ${supportedByProject.length}</strong></td></tr>
            ${projectRows || '<tr><td colspan="2" class="muted">No skills currently substantiated with active CV project context.</td></tr>'}

            <tr class="section-row"><td colspan="2"><strong>3. Mentioned Only (Skills Summary / Keyword List) — ${mentionedOnly.length}</strong></td></tr>
            ${mentionedRows || '<tr><td colspan="2" class="muted">No skills in this category.</td></tr>'}

            <tr class="section-row"><td colspan="2"><strong>4. Missing Qualifications (Required or Preferred in JD) — ${missingSkills.length}</strong></td></tr>
            ${missingRows || '<tr><td colspan="2" class="muted">No missing required skills. 100% qualification coverage!</td></tr>'}

            ${unableToAssess.length > 0 ? `
            <tr class="section-row"><td colspan="2"><strong>5. Unable to Assess — ${unableToAssess.length}</strong></td></tr>
            ${unableRows}
            ` : ""}
        </table>
        <div style="background:#ffffff05;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:11px;color:#94a3b8;line-height:1.5;">
            <strong>5-Tier Hierarchy Definitions:</strong><br>
            • <em>Verified by Repository:</em> Code/manifest evidence confirmed via automated GitHub inspection.<br>
            • <em>Supported by Project Evidence:</em> Active engineering action verbs and descriptive project context in CV text.<br>
            • <em>Mentioned:</em> Listed in skills summary or keyword list without implementation context.<br>
            • <em>Missing:</em> Required or preferred in JD, but absent from application packet.<br>
            • <em>Unable to Assess:</em> Technical evaluation could not be completed.
        </div>
    `;
}

// ── Internship: Proof-of-Skill (GitHub) ───────────────────────────────────────
function renderReportProofOfSkill(app, container, section) {
    if (!container) return;
    if (section) section.style.display = "";

    const pos = app.proofOfSkill;
    if (!pos || pos.status === "not_run" || !pos.repository) {
        container.innerHTML = `
            <table class="report-table">
                <tr><td>Verification Status</td><td><span class="status-pill not_run">Not Run</span></td></tr>
                <tr><td>Inspection Finding</td><td>No public GitHub repository URL was provided for this application. Automated code inspection was <strong>Not Run</strong>; no repository claims or code files are verified.</td></tr>
                <tr><td>Next Step</td><td>Candidate may provide a public repository link to enable automated Proof-of-Skill manifest and language verification.</td></tr>
            </table>
        `;
        return;
    }

    if (pos.status === "unable_to_verify") {
        container.innerHTML = `
            <table class="report-table">
                <tr><td>Target Repository</td><td><a href="${escapeHtml(pos.repository)}" target="_blank">${escapeHtml(pos.repository)}</a></td></tr>
                <tr><td>Verification Status</td><td><span class="status-pill unavailable">Unable to Verify</span></td></tr>
                <tr><td>Reason / Details</td><td>${escapeHtml(pos.message || "GitHub API rate limit or repository access issue. Ensure repository is public.")}</td></tr>
            </table>
        `;
        return;
    }

    const verifiedList = (pos.verified_skills || [])
        .map(v => {
            const isFound = v.status === "evidence_found";
            return `<tr>
                <td><strong>${escapeHtml(v.skill)}</strong></td>
                <td>
                    ${isFound ? `<span class="status-pill strong_alignment">✓ Manifest Verified</span>` : `<span class="status-pill moderate_alignment">Not in Manifest</span>`}
                    ${v.file_path ? `<span style="font-size:11px;color:#38bdf8;margin-left:8px;">[File: ${escapeHtml(v.file_path)}]</span>` : ""}
                    <br><span style="font-size:12px;color:#94a3b8;">${escapeHtml(v.evidence)}</span>
                </td>
            </tr>`;
        })
        .join("");

    const bd = pos.evidence_breakdown || {};

    container.innerHTML = `
        <table class="report-table">
            <tr><td>Target Repository</td><td><a href="${escapeHtml(pos.repository)}" target="_blank" style="color:var(--cyan);text-decoration:underline;">${escapeHtml(pos.owner)}/${escapeHtml(pos.repo)}</a></td></tr>
            <tr><td>Verification Status</td><td><strong>${escapeHtml((pos.status || "").replace(/_/g, " ").toUpperCase())}</strong></td></tr>
            <tr><td>Detected Languages</td><td>${(pos.detected_languages || []).join(", ") || "None"}</td></tr>
            <tr><td>Manifests Analyzed</td><td>${(pos.manifests_analyzed || []).join(", ") || "None"}</td></tr>
            <tr><td>Evidence Categorization</td><td>${bd.implementation_count || 0} Implementation · ${bd.dependency_count || 0} Dependency · ${bd.test_count || 0} Test · ${bd.infrastructure_count || 0} Infrastructure</td></tr>
            <tr><td>Verified Skills Count</td><td><strong>${pos.verified_count || 0} / ${pos.total_claimed || 0}</strong> technical skills verified in repository files</td></tr>
            ${verifiedList ? `<tr class="section-row"><td colspan="2"><strong>Skill-by-Skill Manifest Verification</strong></td></tr>${verifiedList}` : ""}
        </table>
        <p style="font-size:11px;color:var(--muted);margin-top:8px;font-style:italic;">
            Proof-of-Skill performs non-invasive static inspection of public GitHub repository manifests and languages. It does not execute candidate code.
        </p>
    `;
}

// ── Internship: CV Improvement Lab Accepted Revisions ─────────────────────────
function renderReportCvLab(app, container, section) {
    if (!container) return;
    if (section) section.style.display = "";

    const allSuggestions = app.cvSuggestions || app.internshipAnalysis?.suggestions || [];
    const accepted = allSuggestions.filter(s => s.status === "accepted");

    if (accepted.length === 0) {
        container.innerHTML = `
            <div style="padding:14px 18px;background:#ffffff06;border-radius:6px;font-size:13px;color:#94a3b8;">
                <strong style="color:#f8fafc;">No Revisions Accepted Yet:</strong> ${allSuggestions.length} truth-preserving CV suggestions have been generated. Visit the interactive CV Improvement Lab in the Review portal to accept suggested improvements and rerun analysis.
            </div>
        `;
        return;
    }

    const items = accepted.map((s, i) => `
        <div style="padding:12px 16px;background:#ffffff06;border-left:3px solid #00e5a3;border-radius:6px;margin-bottom:10px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <strong style="color:#f8fafc;">#${i + 1} Target: ${escapeHtml(s.target_skill || "Bullet Point")}</strong>
                <span class="status-pill strong_alignment">Accepted Revision</span>
            </div>
            <p style="margin:4px 0 6px;line-height:1.5;color:#e2e8f0;"><strong>Suggested Revision:</strong> “${escapeHtml(s.suggested_bullet)}”</p>
            ${s.original_snippet ? `<p style="font-size:12px;color:#94a3b8;margin:2px 0;">Original snippet: <em>"${escapeHtml(s.original_snippet)}"</em></p>` : ""}
            <p style="font-size:12px;color:var(--muted);margin:2px 0;">Reason: ${escapeHtml(s.reason)}</p>
            ${s.metric_guidance ? `<p style="font-size:11px;color:#38bdf8;margin:3px 0;">💡 Metric Advisory: ${escapeHtml(s.metric_guidance)}</p>` : ""}
        </div>
    `).join("");

    container.innerHTML = `
        <div style="margin-bottom:12px;font-size:13px;color:#94a3b8;">
            <strong>${accepted.length} accepted revision(s)</strong> prepared with active engineering delivery verbs. Integrity guaranteed: zero fabricated metrics.
        </div>
        ${items}
    `;
}

// ── Internship: Prioritized Next Steps & Action Plan (Dynamic Sequential Numbering) ──
function renderInternshipNextSteps(app, container, section) {
    if (!container) return;
    if (section) section.style.display = "";

    const analysis = app.internshipAnalysis;
    const missing = analysis?.missing_required_skills || [];
    const suggestions = app.cvSuggestions || analysis?.suggestions || [];
    const acceptedCount = suggestions.filter(s => s.status === "accepted").length;
    const pos = app.proofOfSkill;

    const rawSteps = [];

    // Step: Missing qualifications
    if (missing.length > 0) {
        rawSteps.push({
            priority: "high",
            title: "Address Missing Mandatory Qualifications (High Priority)",
            desc: `The Job Description explicitly requires <strong>${escapeHtml(missing.join(", "))}</strong>. If you have completed coursework, personal projects, or lab exercises in these technologies, add truthful project bullets describing your implementation before applying.`
        });
    }

    // Step: CV revisions
    if (acceptedCount > 0) {
        rawSteps.push({
            priority: "high",
            title: "Integrate Accepted CV Bullets into Master Resume (High Priority)",
            desc: `You have accepted <strong>${acceptedCount} enhanced bullet revision(s)</strong> in the CV Improvement Lab. Incorporate these bullets into your resume document to replace passive wording with clear, active engineering delivery verbs.`
        });
    } else if (suggestions.length > 0) {
        rawSteps.push({
            priority: "medium",
            title: "Review Generated CV Suggestions in Improvement Lab (Medium Priority)",
            desc: `Review the ${suggestions.length} truth-preserving suggestions in the interactive CV Improvement Lab. Accepting suggested bullets will strengthen experience evidence and elevate your alignment score.`
        });
    }

    // Step: Proof of Skill
    if (!pos || pos.status === "not_run" || !pos.repository) {
        rawSteps.push({
            priority: "medium",
            title: "Provide a Public GitHub Repository for Proof-of-Skill (Medium Priority)",
            desc: `Automated Proof-of-Skill verification was <strong>NOT RUN</strong> because no repository URL was provided. Providing a public GitHub repository allows automated inspection of your dependencies and code structure to verify your technical skills.`
        });
    }

    // Step: Truthful metric guidance
    rawSteps.push({
        priority: "low",
        title: "Quantify Measured Benchmarks (Truthful Metric Guidance)",
        desc: `If you have personally measured performance benchmarks (e.g. API latency reduction, query throughput, test coverage percentage, dataset size), incorporate those exact figures. Never invent unverified percentages or metrics.`
    });

    container.innerHTML = rawSteps.map((s, idx) => `
        <div class="step-card step-priority-${s.priority}">
            <h3>${idx + 1}. ${escapeHtml(s.title)}</h3>
            <p>${s.desc}</p>
        </div>
    `).join("");
}

// ── Document Integrity Analysis (Observed Facts vs Review Signals vs Limitations) ──
function renderReportIntegrity(app, container, section) {
    const integ = app.documentIntegrity;
    if (!integ || !container) return;
    if (section) section.style.display = "";

    const meta = integ.metadata_summary || {};
    const fonts = integ.font_summary || {};
    const facts = integ.observed_facts || {
        page_count: meta.page_count || 1,
        producer: meta.producer || "Unknown",
        creator: meta.creator || "Unknown",
        creation_date: meta.creation_date || "Unknown",
        modification_date: meta.modification_date || "Unknown",
        font_families_count: fonts.distinct_families_count || 1,
    };
    const signals = integ.review_signals || integ.anomalies || [];
    const limitations = integ.technical_limitations || [
        "PDF metadata fields are routinely omitted or modified by legitimate online converters, virtual printers, and export utilities.",
        "Font count variations are standard in modern CV templates utilizing font icons, section headers, and stylized callouts.",
        "Integrity findings are automated formatting and ATS compatibility observations; they do not constitute proof of misrepresentation or tampering.",
    ];

    const signalRows = signals.map(a => `
        <tr>
            <td><strong>${escapeHtml((a.type || "signal").replace(/_/g, " "))}</strong></td>
            <td>
                <span class="status-pill moderate_alignment">${escapeHtml(a.category || "ATS / Layout Signal")}</span>
                <br><span style="color:#d97706;font-size:12px;line-height:1.4;display:block;margin-top:3px;">${escapeHtml(a.description)}</span>
            </td>
        </tr>
    `).join("");

    const checkRows = (integ.checks_performed || []).map(c => `
        <tr>
            <td><strong>${escapeHtml(c.title)}</strong></td>
            <td>
                ${c.status === 'clean' || c.status === 'evaluated' || c.status === 'normal' || c.status === 'selectable_text_present' ? '<span class="status-pill clean">Pass</span>' : '<span class="status-pill moderate_alignment">' + escapeHtml(c.status) + '</span>'}
                <br><span style="font-size:12px;color:#94a3b8;">${escapeHtml(c.detail)}</span>
            </td>
        </tr>
    `).join("");

    container.innerHTML = `
        <table class="report-table">
            <tr class="section-row"><td colspan="2"><strong>1. Observed Technical Facts</strong></td></tr>
            <tr><td>Document Structure Status</td><td><strong>${integ.status === "no_obvious_anomaly_detected" ? "<span class=\"status-pill clean\">No Formatting Anomalies Detected</span>" : "<span class=\"status-pill needs_review\">Formatting Signals Observed</span>"}</strong></td></tr>
            <tr><td>Document Producer / Tool</td><td>${escapeHtml(facts.producer || "Unknown")}</td></tr>
            <tr><td>Creator Application</td><td>${escapeHtml(facts.creator || "Unknown")}</td></tr>
            <tr><td>Creation Timestamp</td><td>${escapeHtml(facts.creation_date || "Unknown")}</td></tr>
            <tr><td>Modification Timestamp</td><td>${escapeHtml(facts.modification_date || "Unknown")}</td></tr>
            <tr><td>Page Count</td><td>${facts.page_count || 1} page(s)</td></tr>
            <tr><td>Distinct Font Families</td><td>${facts.font_families_count || 1} family</td></tr>
            
            <tr class="section-row"><td colspan="2"><strong>2. Technical Structural Checks Performed</strong></td></tr>
            ${checkRows || '<tr><td colspan="2" class="muted">Structural checks performed.</td></tr>'}

            <tr class="section-row"><td colspan="2"><strong>3. Formatting &amp; ATS Review Signals</strong></td></tr>
            ${signalRows || '<tr><td colspan="2" style="color:#00e5a3;">✓ No formatting or ATS anomalies detected. Clean technical structure.</td></tr>'}
        </table>

        <div style="background:#ffffff05;border-radius:6px;padding:12px 16px;margin-top:12px;font-size:12px;line-height:1.6;color:#94a3b8;">
            <strong style="color:#f8fafc;">Technical Limitations &amp; ATS Context:</strong><br>
            <ul style="margin:6px 0 0;padding-left:18px;">
                ${limitations.map(l => `<li>${escapeHtml(l)}</li>`).join("")}
            </ul>
        </div>
    `;
}

// ── Scholarship: Eligibility Results ─────────────────────────────────────────
function renderEligibility(app, container) {
    const result = app.eligibilityResult;
    if (!result) { container.innerHTML = "<p>No eligibility result available.</p>"; return; }

    const rows = [];
    rows.push(`<tr><td>CGPA Requirement Verdict</td><td><strong>${statusLabel(result.status)}</strong></td></tr>`);
    rows.push(`<tr><td>Reason / Details</td><td>${escapeHtml(result.reason || "—")}</td></tr>`);
    if (result.actual_value !== null && result.actual_value !== undefined)
        rows.push(`<tr><td>Your Extracted CGPA</td><td>${result.actual_value}</td></tr>`);
    if (result.required_value !== null && result.required_value !== undefined)
        rows.push(`<tr><td>Required Minimum CGPA</td><td>${result.required_value}</td></tr>`);

    const source = result.requirement_source;
    if (source)
        rows.push(`<tr><td>Requirement Source</td><td>${source === "manual_text" ? "Manually entered requirements" : source === "requirements_pdf" ? "Requirements PDF" : source}</td></tr>`);

    const evidence = result.requirement_evidence || result.evidence;
    if (evidence)
        rows.push(`<tr><td>Requirement Evidence</td><td><em>"${escapeHtml(evidence)}"</em></td></tr>`);

    const fieldResults = result.comprehensive?.field_results || result.field_results || [];
    if (fieldResults.length > 0) {
        rows.push(`<tr class="section-row"><td colspan="2"><strong>All Explicit Criteria Checked</strong></td></tr>`);
        fieldResults.forEach((fr) => {
            rows.push(`<tr>
                <td><strong>${formatFieldName(fr.field)}</strong></td>
                <td>${statusLabel(fr.status)} — ${escapeHtml(fr.reason || "")}
                    ${fr.next_step ? `<br><span class="next-step">→ Action: ${escapeHtml(fr.next_step)}</span>` : ""}
                </td>
            </tr>`);
        });
    }

    container.innerHTML = `<table class="report-table">${rows.join("")}</table>`;
}

// ── Scholarship: Extracted Document Fields ───────────────────────────────────
function renderExtraction(app, container) {
    const ext = app.resumeExtraction;
    if (!ext || ext.status === "failed") {
        container.innerHTML = "<p>No extraction data available.</p>";
        return;
    }
    if (ext.is_scanned) {
        container.innerHTML = "<p>⚠️ Document appears to be scanned. Text extraction not possible.</p>";
        return;
    }

    const fields = ext.fields || {};
    const evidence = ext.evidence || {};
    const LABELS = {
        cgpa: "CGPA", sgpa: "SGPA",
        graduation_year: "Graduation Year",
        admission_year: "Admission Year",
        academic_year: "Academic Year",
    };

    const rows = Object.entries(LABELS).map(([key, label]) => {
        const val = fields[key];
        if (val === null || val === undefined) return `<tr><td>${label}</td><td class="not-found">Not detected</td></tr>`;
        const ev = evidence[key];
        return `<tr><td>${label}</td><td>${escapeHtml(val)}${ev ? ` <span class="ev-ref">(Page ${ev.page}: "${escapeHtml(ev.matched_text)}")</span>` : ""}</td></tr>`;
    }).join("");

    container.innerHTML = `<table class="report-table">${rows}</table>`;
}

// ── Scholarship: Cross-Document Consistency ──────────────────────────────────
function renderComparison(app, container) {
    const result = app.documentComparisonResult;
    if (!result || !result.comparisons) {
        container.innerHTML = "<p>No comparison data. Upload both resume and marksheet PDFs.</p>";
        return;
    }

    const comps = result.comparisons;
    if (typeof comps !== "object" || Array.isArray(comps)) {
        container.innerHTML = "<p>Comparison data format error.</p>";
        return;
    }

    const rows = Object.entries(comps).map(([field, comp]) => `
        <tr>
            <td><strong>${formatFieldName(field)}</strong></td>
            <td>${statusLabel(comp.status)}</td>
            <td>${escapeHtml(comp.message || "—")}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <p style="margin-bottom:10px;"><strong>Overall Consistency: ${statusLabel(result.overall_status)}</strong></p>
        <table class="report-table">
            <tr><th>Field</th><th>Status</th><th>Verification Detail</th></tr>
            ${rows}
        </table>`;
}

// ── Scholarship: Document Classification ─────────────────────────────────────
function renderClassification(app, container, section) {
    const cls = app.classificationResult;
    if (!cls || !container) return;
    if (section) section.style.display = "";

    const confPct = Math.round((cls.confidence || 0) * 100);
    container.innerHTML = `
        <table class="report-table">
            <tr><td>Predicted Document Type</td><td><strong>${escapeHtml(cls.predicted_type || "Unknown")}</strong></td></tr>
            <tr><td>Model Confidence</td><td>${confPct}%</td></tr>
            <tr><td>Classification Method</td><td>${escapeHtml(cls.method || "Classical ML (TF-IDF + Logistic Regression)")}</td></tr>
            <tr><td>Review Recommended</td><td>${cls.review_recommended ? "⚠️ Yes — Confidence below threshold" : "No"}</td></tr>
        </table>
    `;
}

// ── Scholarship: Priority Issues ─────────────────────────────────────────────
function renderIssues(app, container) {
    const issues = [];
    const el = app.eligibilityResult;

    if (el?.status === "not_met") {
        issues.push({
            severity: "high",
            title: "CGPA Requirement Not Met",
            desc: el.reason || "Your CGPA is below the minimum required.",
            action: "Verify if alternative criteria or grade improvement waivers apply.",
        });
    }

    const fieldResults = el?.comprehensive?.field_results || el?.field_results || [];
    fieldResults.forEach((fr) => {
        if (fr.status === "not_met" && fr.field !== "cgpa") {
            issues.push({
                severity: fr.severity || "high",
                title: `${formatFieldName(fr.field)}: Not Met`,
                desc: fr.reason,
                action: fr.next_step || "Provide updated verification documentation.",
            });
        }
    });

    const comp = app.documentComparisonResult;
    if (comp?.comparisons) {
        Object.entries(comp.comparisons).forEach(([field, c]) => {
            if (c.status === "mismatch") {
                issues.push({
                    severity: "high",
                    title: `Document Discrepancy: ${formatFieldName(field)}`,
                    desc: c.message,
                    action: "Ensure your resume and official transcript contain consistent academic details.",
                });
            }
        });
    }

    if (issues.length === 0) {
        container.innerHTML = `<p style="color:#00e5a3;font-weight:600;">✓ No critical issues detected. All checked criteria appear consistent.</p>`;
        return;
    }

    container.innerHTML = issues.map((iss) => `
        <div class="issue-item severity-${iss.severity}">
            <strong>${escapeHtml(iss.title)}</strong>
            <p>${escapeHtml(iss.desc)}</p>
            <p style="font-size:12px;color:var(--cyan);margin-top:4px;">→ Recommended Action: ${escapeHtml(iss.action)}</p>
        </div>
    `).join("");
}

// ── Grounded AI Guidance ──────────────────────────────────────────────────────
function renderGenai(app, container, section) {
    const genai = app.genaiExplanation;
    if (!genai || !genai.text || !container) return;
    if (section) section.style.display = "";

    const renderedHtml = typeof renderMarkdown === "function" ? renderMarkdown(genai.text) : escapeHtml(genai.text);

    container.innerHTML = `
        <div style="background:#ffffff06; border-left: 3px solid var(--primary); padding: 14px 18px; border-radius: 8px; font-size: 13px; line-height: 1.7;">
            ${renderedHtml}
        </div>
        <p style="font-size: 11px; color: var(--muted); margin-top: 8px; font-style: italic;">
            Generated by ${escapeHtml(genai.model || "Gemini")} · Evidence-grounded suggestions, not an official decision.
        </p>`;
}

function formatFieldName(name) {
    const map = {
        cgpa: "Minimum CGPA",
        graduation_year: "Graduation Year",
        required_documents: "Required Document Packet",
        degree: "Academic Degree",
        sgpa: "Semester GPA (SGPA)",
        admission_year: "Admission Year",
        academic_year: "Academic Term",
    };
    return map[name] || (name || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
