"""
ApplyReady AI — Document Classifier (TF-IDF + Logistic Regression)

IMPORTANT: This classifier uses a small toy/demo dataset for demonstration purposes.
The labels are manually assigned and representative, but NOT a validated real-world dataset.
Do NOT report accuracy from this training run as a production metric.

Windows Application Control may block scikit-learn's compiled extensions (murmurhash DLL).
If sklearn import fails, classifier falls back to keyword-based heuristics.
"""

import os
import re
from typing import Optional

SKLEARN_AVAILABLE = False
_vectorizer = None
_classifier = None
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# ── Try to import sklearn ─────────────────────────────────────────────────────
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    import pickle
    SKLEARN_AVAILABLE = True
except (ImportError, Exception) as _e:
    print(f"[classifier] scikit-learn unavailable: {_e}")
    print("[classifier] Falling back to keyword-based heuristic classifier.")


# ── Curated Training Data ──────────────────────────────────────────────────────
# Categories: resume, marksheet, certificate
TRAINING_DATA = [
    # RESUME samples
    ("John Doe\nSoftware Engineer | Backend Developer\nSkills: Python, FastAPI, Docker, PostgreSQL, Redis, Git\nExperience: Software Engineer Intern at Google (2022-2024)\nProjects: Architected microservices REST API handling 10k req/s\nEducation: B.Tech Computer Science Engineering, CGPA 8.5, Batch of 2024\nGithub: github.com/johndoe | LinkedIn: linkedin.com/in/johndoe", "resume"),
    ("Jane Smith\nObjective: Seeking software engineering internship in machine learning and data infrastructure\nTechnical Skills: Python, PyTorch, TensorFlow, Scikit-learn, SQL, Pandas, NumPy, Linux, Git\nExperience: Research Assistant, AI Lab (Summer 2023)\nEducation: Bachelor of Technology in CSE, Expected Graduation: 2025\nProjects: Built end-to-end sentiment classification pipeline and computer vision object detector\nAchievements: National Hackathon Winner 2023", "resume"),
    ("Curriculum Vitae\nRahul Sharma\nEmail: rahul.sharma@domain.com | Phone: +91-9876543210\nSummary: Passionate Full Stack Developer with expertise in React, Node.js, Express, and MongoDB\nWork Experience:\n- Full Stack Web Intern at Tech Solutions (6 months): Developed RESTful APIs and responsive dashboards\nEducation: B.E. Electronics and Communication, Admission: 2020, Graduation: 2024, CGPA: 8.8\nProjects: E-commerce platform with Stripe payment gateway\nTechnical Competencies: JavaScript, TypeScript, React, Node.js, CSS, HTML5", "resume"),
    ("Alice Johnson\nFull Stack Developer\nPortfolio: alicejohnson.dev | Github: github.com/alicejohnson\nEducation: Bachelor of Science, Computer Science, Class of 2026, CGPA: 9.1 / 10.0\nTechnical Skills: Java, Spring Boot, React, MySQL, AWS (EC2, S3), CI/CD, Jest\nWork History:\n- Software Developer Intern, FinTech Corp (Jan 2024 - Present): Optimized SQL queries and microservices\nCertifications: AWS Certified Cloud Practitioner\nProjects: Real-time chat application with WebSocket and Redis pub/sub", "resume"),
    ("Resume - Priya Patel\nContact: priya.patel@email.edu | Bengaluru, India\nProfessional Summary: Undergraduate researcher specializing in Natural Language Processing and Deep Learning\nTechnical Skills: Python, C++, PyTorch, HuggingFace Transformers, Git, Linux bash scripting\nEducation: B.Tech in Artificial Intelligence, Current Year: 3rd Year, CGPA: 8.56, Graduation: 2028\nPublications: Co-authored paper on transformer attention optimization\nProjects: Implemented custom BERT fine-tuning model for document classification", "resume"),
    ("Ankit Verma\nSoftware Developer & Systems Enthusiast\nEducation: B.Tech CSE, 2022-2026 | CGPA: 7.80\nTechnical Skills: C++, C, Java, Go, Data Structures and Algorithms, Docker, Linux, Git\nExperience: Systems Intern, Cloud Native Labs (May 2024 - July 2024)\nProjects: Developed custom HTTP server from scratch in C++ with multithreading\nOpen Source: Active contributor to open-source developer tooling", "resume"),
    ("Devin Brooks\nMobile & Web Engineer\nSkills: Flutter, Dart, Swift, Kotlin, Firebase, REST APIs, GraphQL, Git\nExperience: Mobile App Developer at Startup Hub (2023-2024)\nEducation: B.S. in Software Engineering, Graduating June 2025, GPA 3.8\nProjects: Cross-platform fitness tracking app with 5,000+ active installs on Play Store\nLeadership: President of University Mobile Developers Club", "resume"),
    ("Sneha Roy\nData Scientist & Quantitative Analyst\nSkills: Python, R, SQL, Tableau, Statistics, Predictive Modeling, Machine Learning, Scikit-Learn\nEducation: Integrated M.Tech in Mathematics and Computing, 2021-2026, CGPA: 9.34\nExperience: Data Science Intern at Analytics Corp\nProjects: Algorithmic trading simulation using reinforcement learning\nExtracurriculars: Head of University Data Science Society", "resume"),

    # MARKSHEET samples
    ("University Examination Results\nStudent Name: Priya Sharma\nEnrollment / Roll No: 2021CSE042\nDegree: Bachelor of Technology (Computer Science and Engineering)\nSemester: IV (Fourth Semester Examination)\nAcademic Session: 2022-2023\nCourse Code | Subject Name | Credits | Grade | Grade Points\nCS401 | Database Management Systems | 4 | A+ | 10\nCS402 | Operating Systems | 4 | A | 9\nCS403 | Computer Networks | 3 | B+ | 8\nCS404 | Theory of Computation | 4 | A | 9\nSemester SGPA: 8.85\nCumulative CGPA: 8.23\nResult: PASS WITH DISTINCTION\nController of Examinations", "marksheet"),
    ("Grade Report & Academic Transcript\nInstitute of Engineering and Technology\nCandidate Name: Rahul Kumar | Registration No: 19IT0123\nProgram: Bachelor of Technology in Information Technology\nSemester VI Grade Sheet\nTotal Credits Registered: 24 | Total Credits Earned: 24\nSemester Grade Point Average (SGPA): 8.40\nCumulative Grade Point Average (CGPA): 8.00\nClassification / Division: First Class with Distinction\nDate of Declaration: July 15, 2023", "marksheet"),
    ("Consolidated Statement of Marks\nState Board of Technical Education\nRoll Number: 20EN5041 | Student: Deepika Mehta\nExamination: Fifth Semester Regular Examination\nBranch: Electronics and Communication Engineering\nSubject Marks Obtained / Maximum:\nDigital Signal Processing: 88/100 | Microcontrollers: 79/100 | VLSI Design: 84/100\nTotal Marks: 450/600 | Percentage: 75.00%\nSGPA: 7.95 | Overall CGPA: 8.10\nStatus: PASSED ALL PAPERS", "marksheet"),
    ("Official Academic Transcript\nUniversity of Science and Technology\nStudent Identification: STU2023001 | Date of Admission: August 2021\nDegree Conferred: Bachelor of Engineering\nMajor: Computer Science\nSemester 3 Official Results\nCredits Completed: 22\nSemester SGPA: 9.10 | Overall Cumulative CGPA: 8.76\nAcademic Year: 2023-2024\nRegistrar Signature and University Seal", "marksheet"),
    ("Semester Grade Card\nNational Institute of Technology\nStudent Name: Siddharth Jain | Roll No: 2020IT078\nAcademic Record for Autumn Semester 2023\nDegree: B.Tech in Information Technology\nCumulative Performance:\nTotal Credits: 160 | Cumulative Grade Point Average (CGPA): 8.56\nDivision Awarded: First Class with Distinction\nIssued by Controller of Examinations", "marksheet"),
    ("Marksheet and Result Notification\nDelhi Technical University\nName: Kritgna Patel | Enrollment: 0421IT024\nExamination: Second Semester Grade Report\nSubject Code | Title | Grade\nIT201 | Data Structures | A\nIT202 | Digital Electronics | A+\nIT203 | Mathematics II | B+\nSGPA: 8.85 | CGPA: 8.23\nAcademic Year: 2024-2025\nStatus: PASS", "marksheet"),
    ("Annual Examination Marksheet\nBoard of Secondary and Higher Education\nCandidate: Rohan Gupta | Seat No: B102938\nSubjects: English, Physics, Chemistry, Mathematics, Computer Science\nTheory Marks: 420/500 | Practical Marks: 95/100 | Grand Total: 515/600\nResult: First Division with Honours (85.83%)\nDate: May 2022", "marksheet"),

    # CERTIFICATE samples
    ("CERTIFICATE OF COMPLETION\nThis is to certify that John Doe has successfully completed\nthe online specialization 'Machine Learning & Deep Learning Foundations'\noffered by Coursera in partnership with Stanford Online\nGrade Achieved: 98.4%\nCertificate Verification ID: ML-2023-STAN-7890\nIssued on: July 28, 2023\nAuthorized Signatory", "certificate"),
    ("Certificate of Participation & Merit\nThis certificate is proudly awarded to Priya Sharma\nfor active participation and securing 2nd place in the National Level Hackathon 2023\nOrganized by the IEEE Computer Society Student Branch\nDate: November 14, 2023\nBranch Counselor & Principal Signatures", "certificate"),
    ("INTERNSHIP COMPLETION CERTIFICATE\nTo Whom It May Concern\nThis is to certify that Rahul Kumar has successfully completed a professional internship\nas a Software Engineering Intern at ABC Technologies Ltd.\nDuration: June 1, 2023 to August 31, 2023 (12 Weeks)\nDuring the internship, he demonstrated excellent problem-solving, teamwork, and technical capability in Node.js and React.\nAuthorized Signatory: Head of Human Resources", "certificate"),
    ("Certificate of Academic Excellence & Scholarship Award\nAwarded to: Deepika Mehta\nIn recognition of outstanding academic performance and securing University Rank 1\nin Bachelor of Science Examination for the Academic Session 2022-2023\nPresented by: Vice Chancellor & Dean of Academic Affairs\nAward Date: December 2023", "certificate"),
    ("BONAFIDE STUDENT CERTIFICATE\nTo Whom It May Concern\nThis is to certify that Ankit Verma, Roll No: 2022CSE018, is a bonafide student\nof this institution currently studying in the 3rd year of the B.Tech Computer Science Program\nfor the Academic Year 2024-2025.\nThis certificate is issued upon the student's request for scholarship verification purposes.\nDean of Student Welfare, Seal and Signature", "certificate"),
    ("Certificate of Achievement\nGlobal Cloud Architecture Hackathon 2024\nPresented to Team Nexus for exceptional design and deployment of a resilient distributed system\non Google Cloud Platform.\nSponsored by Google Cloud Developer Groups\nDate: March 2024", "certificate"),
    ("Course Completion Certificate\nFull Stack Web Development Bootcamp\nAwarded to: Kritgna Patel\nFor successfully fulfilling all curriculum requirements including 200+ hours of hands-on coding\nin JavaScript, React, Node.js, and MongoDB.\nDirector of Education, Udemy / EdTech Academy", "certificate"),
]



def _load_or_train() -> bool:
    """Load saved model or train from scratch. Returns True if model is ready."""
    global _vectorizer, _classifier

    if not SKLEARN_AVAILABLE:
        return False

    import pickle

    model_path = os.path.join(_MODEL_DIR, "classifier.pkl")
    vec_path = os.path.join(_MODEL_DIR, "vectorizer.pkl")

    if os.path.exists(model_path) and os.path.exists(vec_path):
        try:
            with open(vec_path, "rb") as f:
                _vectorizer = pickle.load(f)
            with open(model_path, "rb") as f:
                _classifier = pickle.load(f)
            return True
        except Exception as e:
            print(f"[classifier] Could not load saved model: {e}. Retraining.")

    return _train_and_save()


def _train_and_save() -> bool:
    """Train TF-IDF + Logistic Regression and save model artifacts."""
    global _vectorizer, _classifier

    if not SKLEARN_AVAILABLE:
        return False

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        import pickle

        texts = [d[0] for d in TRAINING_DATA]
        labels = [d[1] for d in TRAINING_DATA]

        _vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=500,
            stop_words="english",
            sublinear_tf=True,
        )
        X = _vectorizer.fit_transform(texts)

        _classifier = LogisticRegression(
            max_iter=200,
            random_state=42,
            class_weight="balanced",
            C=1.0,
        )
        _classifier.fit(X, labels)

        os.makedirs(_MODEL_DIR, exist_ok=True)
        with open(os.path.join(_MODEL_DIR, "vectorizer.pkl"), "wb") as f:
            pickle.dump(_vectorizer, f)
        with open(os.path.join(_MODEL_DIR, "classifier.pkl"), "wb") as f:
            pickle.dump(_classifier, f)

        print(f"[classifier] Model trained and saved to {_MODEL_DIR}/")
        return True
    except Exception as e:
        print(f"[classifier] Training failed: {e}")
        return False


# ── Keyword fallback ──────────────────────────────────────────────────────────
_RESUME_KEYWORDS = [
    "experience", "skills", "education", "objective", "summary",
    "projects", "internship", "cgpa", "gpa", "work experience",
    "curriculum vitae", "references", "achievements", "linkedin",
    "github", "certifications", "hobbies", "languages",
]
_MARKSHEET_KEYWORDS = [
    "sgpa", "cgpa", "semester", "academic year", "grade", "credits",
    "result", "pass", "fail", "backlog", "enrollment", "roll no",
    "examination", "subject", "marks", "transcript", "grade report",
    "percentage", "distinction", "consolidated",
]
_CERTIFICATE_KEYWORDS = [
    "certify", "certificate", "awarded", "this is to certify",
    "completion", "participation", "internship certificate",
    "bonafide", "merit", "scholarship award", "to whom it may concern",
    "signed by", "principal", "registrar",
]


def _keyword_classify(text: str) -> dict:
    """Simple keyword-vote heuristic when sklearn is unavailable."""
    text_lower = text.lower()

    resume_score = sum(1 for k in _RESUME_KEYWORDS if k in text_lower)
    marksheet_score = sum(1 for k in _MARKSHEET_KEYWORDS if k in text_lower)
    certificate_score = sum(1 for k in _CERTIFICATE_KEYWORDS if k in text_lower)

    scores = {
        "resume": resume_score,
        "marksheet": marksheet_score,
        "certificate": certificate_score,
    }
    total = sum(scores.values()) or 1
    best_label = max(scores, key=scores.get)
    best_score = scores[best_label]
    confidence = round(best_score / total, 3)

    return {
        "predicted_type": best_label if confidence >= 0.3 else "unknown",
        "confidence": confidence,
        "scores": {k: round(v / total, 3) for k, v in scores.items()},
        "method": "keyword_heuristic",
        "review_recommended": confidence < 0.5,
        "note": (
            "scikit-learn is blocked by Windows Application Control. "
            "Using keyword-based fallback. Results are less accurate."
        ) if not SKLEARN_AVAILABLE else None,
    }


def predict_document_type(text: str) -> dict:
    """
    Classify a document's text into resume / marksheet / certificate.
    Uses ML if available, keyword heuristic otherwise.
    """
    if not text or not text.strip():
        return {
            "predicted_type": "unknown",
            "confidence": 0.0,
            "method": "no_text",
            "review_recommended": True,
            "note": "No text extracted from document.",
        }

    # ML path
    if SKLEARN_AVAILABLE and _classifier is not None and _vectorizer is not None:
        try:
            X = _vectorizer.transform([text])
            proba = _classifier.predict_proba(X)[0]
            classes = _classifier.classes_
            predicted_idx = proba.argmax()
            predicted_label = str(classes[predicted_idx])
            confidence = round(float(proba[predicted_idx]), 3)
            scores = {str(cls): round(float(p), 3) for cls, p in zip(classes, proba)}

            return {
                "predicted_type": str(predicted_label) if confidence >= 0.4 else "unknown",
                "confidence": confidence,
                "scores": scores,
                "method": "tfidf_logistic_regression",
                "review_recommended": confidence < 0.6,
                "note": (
                    "Demo model trained on toy dataset. "
                    "Confidence < 0.6 triggers manual review recommendation."
                ),
            }
        except Exception as e:
            print(f"[classifier] ML inference failed: {e}")
            return _keyword_classify(text)

    return _keyword_classify(text)


# ── Initialize on import ──────────────────────────────────────────────────────
_model_ready = _load_or_train()
