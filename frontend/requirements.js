
"use strict";

// Guard: Require login before uploading documents or verifying requirements
if (typeof requirePageAuth === "function") {
    requirePageAuth();
}

// ── DOM References ─────────────────────────────────────────────────────────────
const applicationForm = document.getElementById("applicationForm");
const formMessage = document.getElementById("formMessage");
const progressSection = document.getElementById("progressSection");
const progressTitle = document.getElementById("progressTitle");
const progressDetail = document.getElementById("progressDetail");
const submitBtn = document.getElementById("submitBtn");
const fetchUrlBtn = document.getElementById("fetchUrlBtn");
const officialUrlInput = document.getElementById("officialUrl");
const urlFetchStatus = document.getElementById("urlFetchStatus");
const requirementsTextArea = document.getElementById("requirementsText");

// ── Pre-populate domain and handle dynamic category UI ───────────────────────
const domainSelect = document.getElementById("domain");
const githubUrlGroup = document.getElementById("githubUrlGroup");
const requirementsLabel = document.getElementById("requirementsLabel");
const requirementsHint = document.getElementById("requirementsHint");
const opportunityNameInput = document.getElementById("opportunityName");

function updateCategoryUI(domain) {
    if (domain === "internship") {
        if (githubUrlGroup) githubUrlGroup.style.display = "block";
        if (requirementsLabel) requirementsLabel.textContent = "Job Description / Role Requirements";
        if (requirementsTextArea) {
            requirementsTextArea.placeholder =
                "Paste Job Description (JD), required tech stack, preferred skills, responsibilities...\n\nExample: Looking for Backend Intern with Python, FastAPI, Docker, and PostgreSQL experience. Solid understanding of data structures required.";
        }
        if (requirementsHint) {
            requirementsHint.textContent = "Tip: Paste the complete Job Description. Our engine maps required vs preferred skills directly against your CV evidence.";
        }
        if (opportunityNameInput && !opportunityNameInput.value) {
            opportunityNameInput.placeholder = "e.g. Software Engineering Intern — Full Stack";
        }
    } else {
        if (githubUrlGroup) githubUrlGroup.style.display = "none";
        if (requirementsLabel) requirementsLabel.textContent = "Scholarship Eligibility Criteria";
        if (requirementsTextArea) {
            requirementsTextArea.placeholder =
                "Paste eligibility criteria, required documents, minimum CGPA, graduation year, income limit...\n\nExample: Minimum CGPA of 8.0, B.Tech students, Batch of 2026 only.";
        }
        if (requirementsHint) {
            requirementsHint.textContent = "Tip: Include minimum CGPA, graduation year, required documents, and degree requirements for best results.";
        }
        if (opportunityNameInput && !opportunityNameInput.value) {
            opportunityNameInput.placeholder = "e.g. Reliance Foundation Undergraduate Scholarship";
        }
    }
}

domainSelect && domainSelect.addEventListener("change", (e) => {
    updateCategoryUI(e.target.value);
});

(function prefillDomain() {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get("domain") || "scholarship";
    if (domain && domainSelect) {
        domainSelect.value = domain;
        updateCategoryUI(domain);
    }
})();

// ── File drop zone behaviour ───────────────────────────────────────────────────
const FILE_FIELDS = [
    { input: "resume",           label: "resumeFileName",      zone: "resumeZone" },
    { input: "marksheet",        label: "marksheetFileName",   zone: "marksheetZone" },
    { input: "certificate",      label: "certificateFileName", zone: "certificateZone" },
    { input: "requirementsFile", label: "reqFileName",         zone: "reqFileZone" },
];

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

FILE_FIELDS.forEach(({ input, label, zone }) => {
    const inputEl = document.getElementById(input);
    const labelEl = document.getElementById(label);
    const zoneEl  = document.getElementById(zone);
    if (!inputEl || !labelEl) return;

    inputEl.addEventListener("change", () => {
        const file = inputEl.files[0];
        if (!file) {
            labelEl.textContent = "Click to select a file";
            zoneEl && zoneEl.classList.remove("has-file", "file-error");
            return;
        }

        const ext = "." + file.name.split(".").pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            labelEl.textContent = `⚠ ${file.name} — only PDF, PNG, JPG allowed`;
            zoneEl && zoneEl.classList.add("file-error");
            inputEl.value = "";
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            labelEl.textContent = `⚠ ${file.name} — file too large (max 5 MB)`;
            zoneEl && zoneEl.classList.add("file-error");
            inputEl.value = "";
            return;
        }

        const sizeKB = (file.size / 1024).toFixed(1);
        labelEl.textContent = `✓ Selected: ${file.name} (${sizeKB} KB)`;
        zoneEl && zoneEl.classList.add("has-file");
        zoneEl && zoneEl.classList.remove("file-error");
    });

    if (zoneEl) {
        zoneEl.addEventListener("click", (e) => {
            if (e.target !== inputEl) {
                inputEl.click();
            }
        });

        // Drag-and-drop
        zoneEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            zoneEl.classList.add("drag-over");
        });
        zoneEl.addEventListener("dragleave", () => {
            zoneEl.classList.remove("drag-over");
        });
        zoneEl.addEventListener("drop", (e) => {
            e.preventDefault();
            zoneEl.classList.remove("drag-over");
            const file = e.dataTransfer.files[0];
            if (file) {
                try {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    inputEl.files = dt.files;
                } catch {
                    inputEl.files = e.dataTransfer.files;
                }
                inputEl.dispatchEvent(new Event("change"));
            }
        });
    }
});

// ── URL Fetch Button ──────────────────────────────────────────────────────────
officialUrlInput && officialUrlInput.addEventListener("input", () => {
    const val = officialUrlInput.value.trim();
    if (fetchUrlBtn) fetchUrlBtn.disabled = !val;
});

fetchUrlBtn && fetchUrlBtn.addEventListener("click", async () => {
    let url = officialUrlInput.value.trim();
    if (!url) return;

    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
        officialUrlInput.value = url;
    }

    fetchUrlBtn.disabled = true;
    fetchUrlBtn.textContent = "Fetching…";
    urlFetchStatus.textContent = "Connecting to URL and extracting opportunity details...";
    urlFetchStatus.className = "field-hint";

    try {
        const data = await apiFetch("/api/fetch-url-requirements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        }, 15000);

        // Auto-fill opportunity name if empty
        const oppInput = document.getElementById("opportunityName");
        if (oppInput && !oppInput.value.trim() && data.pageTitle) {
            oppInput.value = data.pageTitle.slice(0, 100);
        }

        const reqs = data.requirements;
        let structuredBullets = [];

        if (reqs && reqs.minimum_cgpa) {
            structuredBullets.push(`- Minimum CGPA required: ${reqs.minimum_cgpa}`);
        }
        if (reqs && Array.isArray(reqs.criteria)) {
            reqs.criteria.forEach((c) => {
                if (c.type === "graduation_year") structuredBullets.push(`- Eligible Graduation Batch: ${c.value}`);
                if (c.type === "required_degree") structuredBullets.push(`- Eligible Degree: ${c.value}`);
                if (c.type === "required_document") structuredBullets.push(`- Mandatory Document: ${c.value}`);
            });
        }

        if (structuredBullets.length > 0) {
            urlFetchStatus.textContent =
                `✓ Requirements detected from page (${structuredBullets.length} criteria). Populated below.`;
            urlFetchStatus.className = "field-hint success-hint";

            const formattedCriteria = Array.from(new Set(structuredBullets)).join("\n");
            requirementsTextArea.value =
                `Opportunity Eligibility Requirements:\n${formattedCriteria}\n\nPage Overview:\n${data.extractedText || ""}`.trim();
        } else if (data.extractedText) {
            urlFetchStatus.textContent =
                `✓ Page connected. Overview populated below. Please confirm or add specific criteria (e.g. Min CGPA).`;
            urlFetchStatus.className = "field-hint success-hint";
            if (!requirementsTextArea.value.trim()) {
                requirementsTextArea.value = data.extractedText;
            }
        } else {
            urlFetchStatus.textContent = data.message || "Page fetched, but no text found. Please enter criteria manually.";
            urlFetchStatus.className = "field-hint warn-hint";
        }
    } catch (err) {
        urlFetchStatus.textContent = `Notice: ${err.message}`;
        urlFetchStatus.className = "field-hint warn-hint";
    } finally {
        fetchUrlBtn.disabled = false;
        fetchUrlBtn.textContent = "Fetch Requirements";
    }
});

// ── Validation helpers ────────────────────────────────────────────────────────
function showFieldError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}
function clearFieldErrors() {
    ["domainError", "opportunityNameError", "resumeError"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
    });
}

function setProgress(title, detail) {
    if (progressSection) progressSection.classList.remove("hidden");
    if (progressTitle) progressTitle.textContent = title;
    if (progressDetail) progressDetail.textContent = detail || "";
}

function hideProgress() {
    if (progressSection) progressSection.classList.add("hidden");
}

// ── Form Submit ──────────────────────────────────────────────────────────────
applicationForm && applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors();
    formMessage.textContent = "";

    const formData = new FormData(applicationForm);

    // Client-side validation
    let valid = true;

    const domain = formData.get("domain");
    if (!domain) {
        showFieldError("domainError", "Please select an application category.");
        valid = false;
    }

    const opportunityName = (formData.get("opportunityName") || "").trim();
    if (!opportunityName) {
        showFieldError("opportunityNameError", "Opportunity name is required.");
        valid = false;
    } else if (opportunityName.length > 200) {
        showFieldError("opportunityNameError", "Name must be under 200 characters.");
        valid = false;
    }

    const resumeFile = document.getElementById("resume").files[0];
    if (!resumeFile) {
        showFieldError("resumeError", "Please upload your resume or CV.");
        valid = false;
    }

    if (!valid) return;

    submitBtn.disabled = true;
    setProgress("Creating application…", "Sending your opportunity details to the server.");

    try {
        // Step 1: Create application record
        const officialUrl = (formData.get("officialUrl") || "").trim();
        const githubUrl = (formData.get("githubUrl") || "").trim();
        const requirementsText = (formData.get("requirementsText") || "").trim();

        const appData = await apiFetch("/api/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, opportunityName, officialUrl, githubUrl, requirementsText }),
        });

        const applicationId = appData.application.id;
        setProgress("Uploading documents…", "Uploading your files and running verification.");

        // Step 2: Upload documents
        const uploadData = new FormData();
        uploadData.append("requirementsText", requirementsText);
        if (githubUrl) uploadData.append("githubUrl", githubUrl);

        ["resume", "marksheet", "certificate", "requirementsFile"].forEach((field) => {
            const file = document.getElementById(field)?.files[0];
            if (file) uploadData.append(field, file);
        });

        setProgress("Analysing documents…", "Extracting fields, checking eligibility, comparing documents.");

        const uploadResult = await apiFetch(
            `/api/applications/${encodeURIComponent(applicationId)}/documents`,
            { method: "POST", body: uploadData },
            60000 // 60s timeout for full pipeline
        );

        // Step 3: Save to session and redirect
        saveApplication({
            ...appData.application,
            id: applicationId,
            githubUrl,
            files: uploadResult.files,
            resumeExtraction: uploadResult.resumeExtraction,
            requirementsPdfResult: uploadResult.requirementsPdfResult,
            eligibilityResult: uploadResult.eligibilityResult,
            documentComparisonResult: uploadResult.documentComparisonResult,
            classificationResult: uploadResult.classificationResult,
            internshipAnalysis: uploadResult.internshipAnalysis,
            proofOfSkill: uploadResult.proofOfSkill,
            documentIntegrity: uploadResult.documentIntegrity,
            cvSuggestions: uploadResult.cvSuggestions || uploadResult.internshipAnalysis?.suggestions || [],
        });

        window.location.href = "review.html";
    } catch (error) {
        hideProgress();
        formMessage.textContent = `Error: ${error.message}`;
        formMessage.className = "form-message error-message";
    } finally {
        submitBtn.disabled = false;
    }
});
