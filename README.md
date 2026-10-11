# ApplyReady AI

**Evidence-Based Application Readiness & Verification Platform**

An intelligent pair of specialized products designed to help students prepare stronger, verified, evidence-grounded applications before submitting:

1. **Scholarship Verification** — Determine whether submitted academic evidence satisfies scholarship requirements, check document completeness, and detect cross-document inconsistencies.
2. **Internship Intelligence** — Analyze how well a candidate's CV matches an internship job description, verify claimed technical skills through static GitHub inspection, detect document structural anomalies, and suggest truth-preserving CV improvements.

> ⚠️ **Disclaimer:** This tool assists preparation by checking evidence against stated criteria and job descriptions. It does **not** guarantee scholarship selection or internship hiring. All results are evidence-based assessments, not official decisions.

---

## Architecture & Distinct Domains

```
frontend/           → Vanilla HTML5, CSS3, ES2022 JavaScript (No React dependencies)
    index.html      → Landing page with Google Sign-In & quick access
    auth.html       → Dual-tab Login / Registration + Google Identity account chooser
    profile.html    → Student academic credentials, statistics & assessment history
    dashboard.html  → Category selection (Scholarship vs Internship) + recent assessments
    requirements.html → Form: opportunity details, GitHub URL + document upload dropzones
    review.html     → Verification & intelligence portal (dynamic ?id= parameter support)
    report.html     → Executive-grade printable PDF readiness report (@media print)

backend/            → Node.js + Express 4 (Port 5000)
    server.js       → Auth gates, ML proxy, SSRF-safe URL fetch, MongoDB persistence & in-memory stores

ml-service/         → Python 3.12 FastAPI (Port 8000)
    main.py         → FastAPI endpoints
    extractor.py    → PyMuPDF text/table layout extraction
    eligibility.py  → Deterministic eligibility rules & next steps
    requirements_extractor.py → Pattern NLP for requirements parsing
    classifier.py   → TF-IDF + Logistic Regression document classifier
    internship_matcher.py     → Dimensional alignment, skills matrix & CV Improvement Lab
    proof_of_skill.py         → Non-invasive GitHub repository static manifest inspection
    document_integrity.py     → PDF metadata, creator software & font anomaly analyzer
    genai_client.py → Grounded Gemini AI explanations
```

### Component Roles & Integrity Guarantees

| Engine | Technical Method | Integrity Guarantee |
|---|---|---|
| **Eligibility Verification** | Deterministic rule matching | Mathematical comparison (e.g. CGPA, batch year). Zero guessing. |
| **Document Consistency** | Cross-document fuzzy & semantic comparison | Distinguishes semester SGPA from cumulative CGPA. |
| **Classical ML Classifier** | TF-IDF (1-2 n-grams) + Logistic Regression | Trained on multi-class academic documents (`resume`, `marksheet`, `certificate`). |
| **Internship Intelligence** | Multi-dimensional scoring formula | Weights: 60% Required Skills + 25% Experience Grounding + 15% Preferred Skills. |
| **Proof-of-Skill** | GitHub API manifest inspection | Reports `Not Run` when no repo is supplied. Provides exact `file_path` for verified skills. |
| **CV Improvement Lab** | Active verb rewrite & study actions | Never fabricates metrics, percentages, or unearned experience. Preserves separate CV versions. |
| **Document Integrity** | PyMuPDF metadata & font layer analysis | Analyzes PDF export tools, font families, and timestamps for ATS compatibility. |
| **Grounded GenAI** | Google Gemini REST API | Grounded strictly on deterministic outputs; raw student documents are never sent. |

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- Python 3.12 (with `venv312`)
- A modern browser

### 1. Set up Environment Variables
Create or verify `.env` in `backend/`:
```env
PORT=5000
ML_SERVICE_URL=http://127.0.0.1:8000
MONGODB_URI=mongodb://localhost:27017/applyready_ai
GOOGLE_CLIENT_ID=780557102135-1ss4m4dqqfk95dq6et6k43vqrm98ca8l.apps.googleusercontent.com
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Start Python Intelligence Service (Port 8000)
```powershell
cd ml-service
.\venv312\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 3. Start Node.js Express Backend (Port 5000)
```powershell
cd backend
node server.js
```

### 4. Access the Platform
Navigate to: **`http://localhost:5000`** in your browser.

---

## ML Evaluation: Document Classifier

The document classifier uses **TF-IDF (1–2 n-grams) + Logistic Regression** trained on a manually curated demonstration dataset.

> ⚠️ **Transparency note:** The training dataset is a toy/demo set (22 samples, 3 classes). Metrics below are from 3-fold stratified cross-validation. They are illustrative only and should not be interpreted as production-grade benchmarks.

| Metric | Value (3-fold CV) |
|---|---|
| **Accuracy** | 86.36% |
| **Macro Avg Precision** | 89% |
| **Macro Avg Recall** | 86% |
| **Macro Avg F1** | 85% |
| **certificate F1** | 0.73 (3 misclassified as marksheet) |
| **marksheet F1** | 0.88 (all 7 correctly identified) |
| **resume F1** | 0.94 (all 8 correctly identified) |

**Top distinguishing features:** certificate → `certificate`, `certify`, `completion`; marksheet → `semester`, `sgpa`, `grade`, `marks`; resume → `projects`, `skills`, `experience`, `git`

When scikit-learn is unavailable (blocked by Windows Application Control), the service transparently falls back to a keyword-vote heuristic and indicates this in the API response.

---

## Automated Test Suites

All 6 test suites execute cleanly with 100% pass rate — **155 total assertions passing**:

```powershell
# 1. Run Python unit tests (67 passed)
cd ml-service
.\venv312\Scripts\python.exe -m pytest -q

# 2. Run Master Pipeline test (34 passed)
cd ..
node test_master_pipeline.js

# 3. Run Accuracy & Polish test (9 passed)
node test_accuracy_and_polish.js

# 4. Run Mandatory Auth security test (23 passed)
node test_mandatory_auth.js

# 5. Run Google Auth library cryptographic test (15 passed)
node test_google_auth_library.js

# 6. Run Internship Report Accuracy test (7 passed)
node test_internship_report_accuracy.js
```

---

## API Reference

### Backend (Express — Port 5000)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (Node, FastAPI ML status, DB connection) |
| `POST` | `/api/auth/register` | Register student account with email, password, college, degree |
| `POST` | `/api/auth/login` | Login with email and password |
| `POST` | `/api/auth/google` | Verify Google ID token via `google-auth-library` and establish session |
| `GET` | `/api/auth/me` | Retrieve authenticated student profile & stats |
| `POST` | `/api/applications` | Create application (Scholarship or Internship; Admission returns HTTP 400) |
| `GET` | `/api/applications` | List student's applications |
| `GET` | `/api/applications/:id` | Get single application with latest assessment |
| `POST` | `/api/applications/:id/documents` | Upload PDF documents and run full assessment |
| `PATCH` | `/api/applications/:id/cv-suggestions/:sugId` | Accept or reject CV Improvement Lab suggestion |
| `POST` | `/api/applications/:id/rerun-cv-analysis` | Rerun CV analysis with accepted revisions (records before/after deltas) |
| `POST` | `/api/genai-explain` | Grounded Gemini explanation proxy |

### ML Intelligence Service (FastAPI — Port 8000)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health, scikit-learn status, Gemini client status |
| `POST` | `/extract-fields` | Extract CGPA, graduation year, degree from PDF |
| `POST` | `/check-eligibility` | Deterministic CGPA & academic criteria check |
| `POST` | `/compare-documents` | Cross-document consistency comparison |
| `POST` | `/classify-document` | TF-IDF + Logistic Regression document type classification |
| `POST` | `/analyze-internship` | Extract JD requirements, match CV evidence, calculate alignment index |
| `POST` | `/verify-skills` | Non-invasive GitHub repository manifest & language inspection |
| `POST` | `/analyze-integrity` | PDF metadata, creator, font layers & structural anomaly analysis |
| `POST` | `/genai-explain` | Generate grounded advice from verified assessment results |
