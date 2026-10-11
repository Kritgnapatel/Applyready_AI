"""
ApplyReady AI — Internship Intelligence & Matcher Engine
Analyzes Job Descriptions (JD) and Candidate CVs.
Performs deterministic skill extraction, evidence-grounded matching,
dimensional alignment scoring, and truth-preserving CV rewrite recommendations.
Never fabricates skills, metrics, or hiring probabilities.
"""

import re
from typing import Dict, List, Any, Optional

# Curated catalog of technical & professional skills for high-precision extraction
SKILL_CATALOG = {
    # Programming Languages
    "python": ["python", "py", "python3"],
    "javascript": ["javascript", "js", "ecmascript"],
    "typescript": ["typescript", "ts"],
    "java": ["java", "core java"],
    "c++": ["c++", "cpp"],
    "c": ["c language", "embedded c"],
    "c#": ["c#", "csharp", ".net"],
    "go": ["golang", "go language"],
    "rust": ["rust", "rustlang"],
    "ruby": ["ruby"],
    "php": ["php"],
    "sql": ["sql", "mysql", "postgresql", "postgres", "sqlite", "tsql"],
    "html/css": ["html", "html5", "css", "css3", "sass", "tailwind", "bootstrap"],

    # Frameworks & Libraries
    "react": ["react", "react.js", "reactjs"],
    "node.js": ["node.js", "nodejs", "node"],
    "express": ["express", "express.js", "expressjs"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "flask": ["flask"],
    "spring boot": ["spring boot", "springboot", "spring"],
    "angular": ["angular", "angularjs"],
    "vue.js": ["vue", "vue.js", "vuejs"],
    "next.js": ["next.js", "nextjs"],

    # Machine Learning & Data Science
    "machine learning": ["machine learning", "ml", "statistical learning"],
    "deep learning": ["deep learning", "neural networks", "cnn", "rnn", "transformer", "lstm"],
    "nlp": ["nlp", "natural language processing", "text processing"],
    "computer vision": ["computer vision", "opencv", "image processing"],
    "scikit-learn": ["scikit-learn", "sklearn"],
    "tensorflow": ["tensorflow", "tf"],
    "pytorch": ["pytorch", "torch"],
    "pandas": ["pandas"],
    "numpy": ["numpy"],

    # Databases & Caching
    "mongodb": ["mongodb", "mongo", "nosql"],
    "redis": ["redis"],
    "elasticsearch": ["elasticsearch"],
    "firebase": ["firebase", "firestore"],

    # DevOps & Cloud
    "docker": ["docker", "containerization", "containers"],
    "kubernetes": ["kubernetes", "k8s"],
    "aws": ["aws", "amazon web services", "ec2", "s3", "lambda"],
    "azure": ["azure", "microsoft azure"],
    "gcp": ["gcp", "google cloud", "google cloud platform"],
    "git": ["git", "github", "gitlab", "version control"],
    "ci/cd": ["ci/cd", "continuous integration", "github actions", "jenkins"],
    "linux": ["linux", "unix", "bash", "shell scripting"],

    # Architecture & Concepts
    "rest api": ["rest", "restful", "rest api", "restful api", "apis", "api development"],
    "graphql": ["graphql"],
    "microservices": ["microservices", "distributed systems"],
    "data structures": ["data structures", "dsa", "algorithms"],
    "testing": ["unit testing", "pytest", "jest", "junit", "tdd", "integration testing"],
}


def normalize_text(text: str) -> str:
    """Normalize text by lowering and collapsing whitespace."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.lower()).strip()


def extract_skills_from_text(text: str) -> Dict[str, Dict[str, Any]]:
    """
    Extracts catalogued skills from text and captures context snippet/sentences.
    """
    if not text:
        return {}

    normalized = normalize_text(text)
    # Split text into sentences for snippet extraction
    sentences = re.split(r"(?<=[.!?\n])\s+", text)
    found_skills = {}

    for canonical_name, aliases in SKILL_CATALOG.items():
        matched_alias = None
        matched_sentence = None

        for alias in aliases:
            # Word boundary matching to avoid substrings like 'c' in 'concept'
            pattern = r"(?<![a-zA-Z0-9_\+#])" + re.escape(alias) + r"(?![a-zA-Z0-9_\+#])"
            match = re.search(pattern, normalized)
            if match:
                matched_alias = alias
                # Find the sentence containing this match
                for sent in sentences:
                    if re.search(pattern, sent, re.IGNORECASE):
                        matched_sentence = sent.strip()
                        break
                break

        if matched_alias:
            found_skills[canonical_name] = {
                "canonical": canonical_name,
                "matched_token": matched_alias,
                "snippet": matched_sentence or "",
            }

    return found_skills


def categorize_jd_skills(jd_text: str) -> Dict[str, List[str]]:
    """
    Differentiates required skills vs preferred skills in a Job Description.
    """
    if not jd_text:
        return {"required": [], "preferred": [], "all": []}

    all_skills = extract_skills_from_text(jd_text)
    if not all_skills:
        return {"required": [], "preferred": [], "all": []}

    lower_jd = jd_text.lower()

    # Look for common sections
    req_markers = ["required", "must have", "minimum qualifications", "requirements", "basic qualifications", "what you need"]
    pref_markers = ["preferred", "nice to have", "good to have", "bonus", "plus", "desired", "preferred qualifications"]

    required_skills = []
    preferred_skills = []

    # Break text into logical segments (lines and sentence boundaries)
    segments = re.split(r"[\n\r]+|(?<=[.;])\s+", jd_text)
    current_section = "required"

    for seg in segments:
        seg_lower = seg.lower().strip()
        if not seg_lower:
            continue

        has_pref = any(marker in seg_lower for marker in pref_markers)
        has_req = any(marker in seg_lower for marker in req_markers)

        if has_pref and not has_req:
            current_section = "preferred"
        elif has_req and not has_pref:
            current_section = "required"
        elif has_pref and has_req:
            # Contains both in same segment, e.g. "Required: X. Preferred: Y"
            # Split by markers
            pos_pref = min(seg_lower.find(m) for m in pref_markers if m in seg_lower)
            pos_req = min(seg_lower.find(m) for m in req_markers if m in seg_lower)
            if pos_req < pos_pref:
                req_sub = seg[:pos_pref]
                pref_sub = seg[pos_pref:]
            else:
                pref_sub = seg[:pos_req]
                req_sub = seg[pos_req:]

            for s in extract_skills_from_text(req_sub):
                if s not in required_skills:
                    required_skills.append(s)
            for s in extract_skills_from_text(pref_sub):
                if s not in preferred_skills and s not in required_skills:
                    preferred_skills.append(s)
            continue

        seg_skills = extract_skills_from_text(seg)
        for s in seg_skills:
            if current_section == "preferred":
                if s not in preferred_skills and s not in required_skills:
                    preferred_skills.append(s)
            else:
                if s not in required_skills:
                    required_skills.append(s)

    # Any remaining skills default to required
    for s in all_skills:
        if s not in required_skills and s not in preferred_skills:
            required_skills.append(s)

    return {
        "required": required_skills,
        "preferred": preferred_skills,
        "all": list(all_skills.keys()),
    }


def strip_contact_artifacts(text: str) -> str:
    """
    Strips email addresses, phone numbers, and profile/social URLs so they cannot
    falsely match technical skills (e.g. rahul.git@gmail.com matching 'git').
    """
    if not text:
        return ""
    # Strip emails
    t = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", " ", text)
    # Strip profile URLs & web URLs
    t = re.sub(r"(https?://\S+|www\.\S+|github\.com/\S*|gitlab\.com/\S*|linkedin\.com/\S*)", " ", t, flags=re.IGNORECASE)
    # Strip phone numbers
    t = re.sub(r"(\+?\d[\d \-]{8,}\d)", " ", t)
    return t


def is_pure_contact_info(text: str) -> bool:
    """
    Checks if a snippet is generic CV contact/header information rather than technical project content.
    Prevents emails (e.g. rahul.git@gmail.com) and phone lines from falsely verifying technical skills.
    """
    if not text:
        return False
    lower = text.lower()
    has_email = bool(re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text))
    has_phone = bool(re.search(r"(\+?\d[\d \-]{8,}\d)", text))
    has_contact_labels = any(lbl in lower for lbl in ["phone:", "email:", "contact:", "address:", "linkedin.com", "mobile:"])
    
    if has_email or has_phone or has_contact_labels:
        action_verbs = ["built", "developed", "implemented", "designed", "created", "engineered", "deployed"]
        has_action = any(w in lower for w in action_verbs)
        if not has_action or len(text.split()) < 18:
            return True
    return False


def analyze_cv_skill_evidence(cv_text: str, skill: str) -> Dict[str, Any]:
    """
    Evaluates whether a skill is 'demonstrated' with project/work context,
    'mentioned' in a list, or 'missing'.
    Generic contact information (email, phone, profile URLs) is strictly ignored.
    """
    if not cv_text:
        return {"status": "missing", "evidence": None}

    aliases = SKILL_CATALOG.get(skill, [skill])
    matched_alias = None
    matched_sentences = []

    # Split into lines or punctuation-separated sentences
    sentences = re.split(r"[\r\n]+|(?<=[.!?•\-\*])\s+", cv_text)

    for alias in aliases:
        pattern = r"(?<![a-zA-Z0-9_\+#])" + re.escape(alias) + r"(?![a-zA-Z0-9_\+#])"
        for sent in sentences:
            cleaned = sent.strip()
            if not cleaned or is_pure_contact_info(cleaned):
                continue
            # Also check text without email/profile artifacts to ensure skill isn't inside an email/URL
            stripped = strip_contact_artifacts(cleaned)
            if re.search(pattern, stripped, re.IGNORECASE):
                if cleaned not in matched_sentences:
                    matched_sentences.append(cleaned)
                    matched_alias = alias

    if not matched_sentences:
        return {"status": "missing", "evidence": None}

    # Analyze context: is it merely a comma-separated list or an active project/bullet?
    best_sentence = max(matched_sentences, key=len)
    
    # Check for verbs or context words that indicate active usage
    action_words = [
        "built", "developed", "implemented", "designed", "created", "engineered",
        "deployed", "optimized", "integrated", "architected", "maintained", "automated",
        "used", "using", "leveraged", "utilized", "tested", "project", "experience"
    ]
    is_demonstrated = any(re.search(rf"\b{word}\b", best_sentence, re.IGNORECASE) for word in action_words)
    
    # Check if sentence looks like a skills list (lots of commas, short tokens)
    comma_count = best_sentence.count(",")
    is_list_like = (comma_count >= 3 and len(best_sentence.split()) <= 15) or "skills:" in best_sentence.lower()

    if is_demonstrated and not is_list_like:
        return {
            "status": "supported by project evidence",
            "evidence": best_sentence[:250],
            "matched_token": matched_alias,
        }
    else:
        return {
            "status": "mentioned",
            "evidence": best_sentence[:200],
            "matched_token": matched_alias,
        }


# High-impact, truth-preserving bullet templates for weak/mentioned skills
# Never fabricates algorithm complexity, performance benchmarks, or enterprise architecture claims
SKILL_ACTION_TEMPLATES = {
    "python": "Implemented modular application features and data workflows using Python with structured error handling.",
    "javascript": "Developed interactive client-side components and asynchronous API integrations using modern JavaScript.",
    "typescript": "Built typed web application modules using TypeScript with strict interface definitions.",
    "react": "Developed responsive user interface components using React with state management and REST API integration.",
    "node.js": "Developed backend services and REST API endpoints using Node.js.",
    "express": "Designed RESTful API endpoints and middleware using Express with request validation.",
    "fastapi": "Built asynchronous API services using FastAPI with Pydantic request models.",
    "django": "Developed full-stack web applications using Django with ORM models and standard authentication.",
    "flask": "Implemented modular backend application endpoints and database connections using Flask.",
    "docker": "Configured Docker containers to standardize development and deployment environments.",
    "sql": "Designed relational database tables and structured SQL queries for reliable data persistence.",
    "mongodb": "Modeled document collections and aggregation queries using MongoDB for persistent storage.",
    "git": "Managed distributed version control workflows using Git with branch management and pull requests.",
    "rest api": "Implemented RESTful API endpoints with structured request validation and JSON responses.",
    "data structures": "Implemented fundamental data structures and algorithmic routines for core application logic.",
    "testing": "Implemented automated unit and integration test suites using standard test frameworks to verify functionality.",
    "machine learning": "Trained and evaluated baseline machine learning models with feature preprocessing and train/validation splits.",
    "deep learning": "Implemented neural network models using standard deep learning frameworks for classification tasks.",
    "nlp": "Developed natural language text processing routines including tokenization, normalization, and classification.",
    "ci/cd": "Configured continuous integration build workflows to run automated tests on commits.",
    "aws": "Configured cloud application deployment on AWS using standard compute and storage services.",
}


def generate_cv_improvement_suggestions(cv_text: str, missing_skills: List[str], weak_skills: List[str]) -> List[Dict[str, Any]]:
    """
    Generates truth-preserving CV bullet suggestions.
    Crucially: NEVER fabricates fake metrics, numbers, or achievements.
    Provides clean, syntactically complete, professional sentences with zero bracketed placeholders.
    Includes separate advisory metric guidance for the candidate to review.
    """
    suggestions = []
    suggestion_id = 1

    # 1. Suggest improvements for skills that were only 'mentioned' without active project evidence
    for skill in weak_skills[:3]:
        canonical = skill.lower().strip()
        template = SKILL_ACTION_TEMPLATES.get(
            canonical,
            f"Implemented core application features using {skill.capitalize()}, ensuring structured component design, clean code practices, and comprehensive error handling."
        )

        suggestions.append({
            "id": f"sug_{suggestion_id}",
            "type": "add_project_evidence",
            "target_skill": skill,
            "original_snippet": f"Mentioned in skills list: {skill.capitalize()}",
            "suggested_bullet": template,
            "metric_guidance": f"If you have benchmarked performance or usage metrics for your {skill.capitalize()} projects (e.g. daily users, latency, test coverage), consider adding those exact figures.",
            "reason": f"'{skill.capitalize()}' is listed in your skills summary, but not substantiated in a concrete project bullet point.",
            "dimension": "experience_evidence",
            "status": "pending",
        })
        suggestion_id += 1

    # 2. Identify weak bullet points in CV that lack active impact phrasing
    lines = [line.strip() for line in cv_text.splitlines() if len(line.strip()) > 30]
    action_bullet_pattern = r"^(?:[-•*]\s*)?(developed|built|created|implemented|worked on|worked with)\b"

    weak_bullets_found = 0
    for line in lines:
        if weak_bullets_found >= 3:
            break
        cleaned_line = re.sub(r"^[-•*]\s*", "", line).strip()
        if re.search(action_bullet_pattern, cleaned_line, re.IGNORECASE):
            has_metric = bool(re.search(r"\b(\d+%?|\d+x|\d+k|\d+ms|\d+s)\b", cleaned_line, re.IGNORECASE))
            if not has_metric:
                # Strengthen the sentence structure with active delivery verbs
                revised = cleaned_line
                if not revised.endswith("."):
                    revised += "."
                # Replace weak starter phrases with standard active engineering verbs
                revised = re.sub(r"^(?:worked on|worked with)\s+", "Developed ", revised, flags=re.IGNORECASE)
                revised = re.sub(r"^(?:built|created)\s+", "Implemented ", revised, flags=re.IGNORECASE)

                suggestions.append({
                    "id": f"sug_{suggestion_id}",
                    "type": "quantify_impact",
                    "target_skill": "bullet_impact",
                    "original_snippet": cleaned_line[:140],
                    "suggested_bullet": revised,
                    "metric_guidance": "If measured during testing or development, incorporate your exact metrics (e.g. response time, throughput, or dataset size) to further demonstrate scale.",
                    "reason": "This project bullet describes technical activity. Refactoring with direct active verbs and any real measured metrics strengthens evidence.",
                    "dimension": "bullet_impact",
                    "status": "pending",
                })
                suggestion_id += 1
                weak_bullets_found += 1

    # 3. Guidance for missing required skills (Truthful recommendation: do NOT invent experience)
    if missing_skills:
        for missing in missing_skills[:3]:
            suggestions.append({
                "id": f"sug_{suggestion_id}",
                "type": "missing_skill_action",
                "target_skill": missing,
                "original_snippet": f"Skill not detected in CV: {missing.capitalize()}",
                "information_request": f"Have you completed coursework, lab exercises, or personal projects using {missing.capitalize()}?",
                "suggested_bullet": f"Completed academic coursework and lab assignments in {missing.capitalize()}, applying foundational syntax, standard libraries, and structured problem-solving.",
                "non_quantified_alternative": f"Studied fundamental concepts and software development patterns in {missing.capitalize()} through academic curriculum.",
                "metric_guidance": "Truth-in-advertising principle: Only incorporate this bullet if you have completed actual academic or personal coursework in this technology. Never claim unearned professional experience.",
                "reason": f"Required in the Job Description, but not currently substantiated in your CV text.",
                "dimension": "required_skills_coverage",
                "status": "pending",
            })
            suggestion_id += 1

    return suggestions



def match_internship(
    jd_text: str,
    cv_text: str,
    opportunity_name: str = "",
    proof_of_skill: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Internship Intelligence analysis.
    Produces 5-tier skill status breakdown:
      - 'verified by repository'
      - 'supported by project evidence'
      - 'mentioned'
      - 'missing'
      - 'unable to assess'
    Produces dimensional breakdown, evidence citations, and truth-preserving CV suggestions.
    """
    if not jd_text and not opportunity_name:
        jd_categorized = {"required": ["python", "data structures", "git"], "preferred": [], "all": ["python", "data structures", "git"]}
    else:
        jd_categorized = categorize_jd_skills(jd_text or opportunity_name)

    required_skills = jd_categorized.get("required", [])
    preferred_skills = jd_categorized.get("preferred", [])
    all_jd_skills = jd_categorized.get("all", [])

    # If no skills could be extracted from JD, use standard software engineering defaults
    if not all_jd_skills:
        required_skills = ["git", "data structures"]
        preferred_skills = ["testing"]
        all_jd_skills = required_skills + preferred_skills

    # Collect any skills verified via GitHub repository inspection (Proof-of-Skill)
    repo_verified_skills = set()
    repo_inspected_files = {}
    if proof_of_skill and proof_of_skill.get("status") not in ("not_run", "unable_to_verify", None):
        for vs in proof_of_skill.get("verified_skills", []):
            if vs.get("status") == "evidence_found":
                canonical = vs.get("skill", "").lower().strip()
                repo_verified_skills.add(canonical)
                if vs.get("file_path"):
                    repo_inspected_files[canonical] = vs.get("file_path")

    # Match each required and preferred skill against CV and repository
    skill_matrix = []
    matched_required_count = 0
    demonstrated_required_count = 0
    missing_required = []
    weak_skills = []

    for s in required_skills:
        ev = analyze_cv_skill_evidence(cv_text, s)
        cv_status = ev["status"]
        skill_lower = s.lower().strip()

        # Check repository verification first (highest tier of technical proof)
        if skill_lower in repo_verified_skills:
            final_status = "verified by repository"
            matched_required_count += 1
            demonstrated_required_count += 1
            evidence_desc = (
                f"Verified in repository manifest [File: {repo_inspected_files.get(skill_lower, 'manifest')}]. "
                + (f"CV context: \"{ev['evidence']}\"" if ev.get("evidence") else "")
            ).strip()
        elif cv_status in ("supported by project evidence", "demonstrated"):
            final_status = "supported by project evidence"
            matched_required_count += 1
            demonstrated_required_count += 1
            evidence_desc = ev.get("evidence")
        elif cv_status == "mentioned":
            final_status = "mentioned"
            matched_required_count += 1
            weak_skills.append(s)
            evidence_desc = ev.get("evidence")
        else:
            final_status = "missing"
            missing_required.append(s)
            evidence_desc = None

        skill_matrix.append({
            "skill": s,
            "category": "required",
            "status": final_status,
            "evidence": evidence_desc,
            "token": ev.get("matched_token"),
            "repository_verified": skill_lower in repo_verified_skills,
        })

    matched_preferred_count = 0
    demonstrated_preferred_count = 0
    missing_preferred = []

    for s in preferred_skills:
        ev = analyze_cv_skill_evidence(cv_text, s)
        cv_status = ev["status"]
        skill_lower = s.lower().strip()

        if skill_lower in repo_verified_skills:
            final_status = "verified by repository"
            matched_preferred_count += 1
            demonstrated_preferred_count += 1
            evidence_desc = (
                f"Verified in repository manifest [File: {repo_inspected_files.get(skill_lower, 'manifest')}]. "
                + (f"CV context: \"{ev['evidence']}\"" if ev.get("evidence") else "")
            ).strip()
        elif cv_status in ("supported by project evidence", "demonstrated"):
            final_status = "supported by project evidence"
            matched_preferred_count += 1
            demonstrated_preferred_count += 1
            evidence_desc = ev.get("evidence")
        elif cv_status == "mentioned":
            final_status = "mentioned"
            matched_preferred_count += 1
            weak_skills.append(s)
            evidence_desc = ev.get("evidence")
        else:
            final_status = "missing"
            missing_preferred.append(s)
            evidence_desc = None

        skill_matrix.append({
            "skill": s,
            "category": "preferred",
            "status": final_status,
            "evidence": evidence_desc,
            "token": ev.get("matched_token"),
            "repository_verified": skill_lower in repo_verified_skills,
        })

    # Dimensional Scores (strictly calculated, no fake random numbers)
    req_total = len(required_skills) or 1
    req_coverage_pct = round((matched_required_count / req_total) * 100, 1)

    pref_total = len(preferred_skills) or 1
    pref_coverage_pct = round((matched_preferred_count / pref_total) * 100, 1) if preferred_skills else 100.0

    # Evidence score based on proportion of demonstrated/verified vs merely mentioned skills
    total_matched = matched_required_count + matched_preferred_count
    if total_matched > 0:
        evidence_score_pct = round((demonstrated_required_count / total_matched) * 100, 1)
    else:
        evidence_score_pct = 0.0

    # Overall Technical Alignment Index (weighted dimensional score)
    # Required skills = 60%, Evidence grounding = 25%, Preferred skills = 15%
    if preferred_skills:
        req_weight = 0.60
        ev_weight = 0.25
        pref_weight = 0.15
        alignment_index = round(
            (req_coverage_pct * req_weight) + (evidence_score_pct * ev_weight) + (pref_coverage_pct * pref_weight), 1
        )
    else:
        req_weight = 0.70
        ev_weight = 0.30
        pref_weight = 0.0
        alignment_index = round(
            (req_coverage_pct * req_weight) + (evidence_score_pct * ev_weight), 1
        )

    # Determine qualitative alignment status
    if req_coverage_pct >= 80 and evidence_score_pct >= 60:
        alignment_status = "strong_alignment"
        alignment_label = "Strong Alignment"
    elif req_coverage_pct >= 50:
        alignment_status = "moderate_alignment"
        alignment_label = "Moderate Alignment"
    else:
        alignment_status = "significant_gaps"
        alignment_label = "Skill Gaps Identified"

    scoring_methodology = {
        "formula": (
            "60% Required Skills Coverage + 25% Experience Evidence Grounding + 15% Preferred Skills Coverage"
            if preferred_skills else
            "70% Required Skills Coverage + 30% Experience Evidence Grounding"
        ),
        "weights": {
            "required_skills_coverage": req_weight,
            "experience_evidence_score": ev_weight,
            "preferred_skills_coverage": pref_weight,
        },
        "contribution_points": {
            "required_skills_pts": round(req_coverage_pct * req_weight, 1),
            "experience_evidence_pts": round(evidence_score_pct * ev_weight, 1),
            "preferred_skills_pts": round(pref_coverage_pct * pref_weight, 1) if preferred_skills else 0.0,
        },
        "status_definitions": {
            "verified_by_repository": "Skill verified through automated inspection of public repository manifests or source files.",
            "supported_by_project_evidence": "Skill substantiated in CV with active project context, action verbs, and implementation description.",
            "mentioned": "Skill listed in CV keywords, summary, or comma-separated list without active project context.",
            "missing": "Skill required or preferred in the Job Description, but not found in CV or repository.",
            "unable_to_assess": "Assessment could not be completed due to missing or unreadable input.",
        },
        "description": "Objective diagnostic measure of qualification overlap and project context. Not a hiring probability.",
    }

    # Generate CV improvement suggestions
    cv_suggestions = generate_cv_improvement_suggestions(cv_text, missing_required, weak_skills)

    return {
        "domain": "internship",
        "alignment_status": alignment_status,
        "alignment_label": alignment_label,
        "alignment_index": alignment_index,
        "scoring_methodology": scoring_methodology,
        "dimensions": {
            "required_skills_coverage": {
                "matched": matched_required_count,
                "total": len(required_skills),
                "percentage": req_coverage_pct,
            },
            "preferred_skills_coverage": {
                "matched": matched_preferred_count,
                "total": len(preferred_skills),
                "percentage": pref_coverage_pct,
            },
            "experience_evidence_score": {
                "demonstrated_count": demonstrated_required_count,
                "total_matched": total_matched,
                "percentage": evidence_score_pct,
            },
        },
        "skills_matrix": skill_matrix,
        "missing_required_skills": missing_required,
        "missing_preferred_skills": missing_preferred,
        "suggestions": cv_suggestions,
        "note": (
            "The Technical Alignment Index measures skill overlap and evidence grounding. "
            "It is not a hiring decision or recruitment guarantee."
        ),
    }
