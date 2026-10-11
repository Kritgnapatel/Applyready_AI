"""
ApplyReady AI — Test Suite for Internship Intelligence, Proof of Skill, and Document Integrity
"""

import pytest
import pymupdf
import internship_matcher
import proof_of_skill
import document_integrity


# ─── 1. INTERNSHIP MATCHER TESTS ──────────────────────────────────────────────
def test_skill_catalog_extraction():
    text = (
        "We are looking for a Software Engineer intern skilled in Python, React, and Docker. "
        "Experience with PostgreSQL and Git is required."
    )
    skills = internship_matcher.extract_skills_from_text(text)
    assert "python" in skills
    assert "react" in skills
    assert "docker" in skills
    assert "sql" in skills
    assert "git" in skills


def test_jd_skills_categorization():
    jd = """
    Required Qualifications:
    - Proficient in Python, FastAPI, and PostgreSQL.
    - Solid understanding of Data Structures and Git.

    Preferred Qualifications:
    - Experience with Docker and Kubernetes.
    - Knowledge of PyTorch or Machine Learning.
    """
    cat = internship_matcher.categorize_jd_skills(jd)
    assert "python" in cat["required"]
    assert "fastapi" in cat["required"]
    assert "docker" in cat["preferred"] or "kubernetes" in cat["preferred"]


def test_cv_evidence_distinction():
    cv = """
    TECHNICAL SKILLS:
    Languages: Python, Java, C++
    Frameworks: React, Express

    EXPERIENCE & PROJECTS:
    - Developed a real-time analytics dashboard using Python and React, handling 500+ daily events.
    - Implemented database migrations and caching for optimized throughput.
    """
    # Python is supported with active project context
    py_ev = internship_matcher.analyze_cv_skill_evidence(cv, "python")
    assert py_ev["status"] in ("supported by project evidence", "demonstrated")
    assert "analytics dashboard" in py_ev["evidence"]

    # Java is only mentioned in skills list
    java_ev = internship_matcher.analyze_cv_skill_evidence(cv, "java")
    assert java_ev["status"] == "mentioned"

    # Go is missing
    go_ev = internship_matcher.analyze_cv_skill_evidence(cv, "go")
    assert go_ev["status"] == "missing"


def test_skills_matrix_5_tier_hierarchy_and_proof_of_skill():
    jd = "Required: Python, React, Docker. Preferred: Kubernetes."
    cv = "Skills: Python, Docker. Experience: Developed full-stack UI using React."
    pos_mock = {
        "status": "verified",
        "verified_skills": [
            {"skill": "docker", "status": "evidence_found", "file_path": "Dockerfile"},
        ]
    }
    result = internship_matcher.match_internship(jd, cv, "Fullstack Intern", proof_of_skill=pos_mock)
    matrix = {s["skill"]: s for s in result["skills_matrix"]}

    # Docker was verified in repository manifest
    assert matrix["docker"]["status"] == "verified by repository"
    assert matrix["docker"]["repository_verified"] is True

    # React has active project evidence in CV
    assert matrix["react"]["status"] == "supported by project evidence"

    # Python is only mentioned in skills list
    assert matrix["python"]["status"] == "mentioned"

    # Kubernetes is missing
    assert matrix["kubernetes"]["status"] == "missing"


def test_full_internship_match():
    jd = "Required: Python, Git. Preferred: Docker."
    cv = "Skills: Python, Git. Built a machine learning model using Python and Git for version control."
    result = internship_matcher.match_internship(jd, cv, "Backend Internship")

    assert result["domain"] == "internship"
    assert result["dimensions"]["required_skills_coverage"]["percentage"] == 100.0
    assert result["alignment_index"] > 50.0
    assert len(result["skills_matrix"]) >= 3
    # Verify suggestions are clean, truth-preserving, and contain NO bracketed placeholders
    for sug in result["suggestions"]:
        bullet = sug["suggested_bullet"]
        assert "[" not in bullet, f"Bullet must not contain raw placeholders: {bullet}"
        assert "X%" not in bullet, f"Bullet must not contain fake placeholders: {bullet}"
        assert "N requests" not in bullet, f"Bullet must not contain fake placeholders: {bullet}"
        assert sug.get("metric_guidance") is not None, "Metric guidance should be provided as separate advisory advice"


def test_cv_suggestions_no_metric_fabrication():
    cv = """
    PROJECTS:
    - Built REST API endpoints with Node.js and Express
    - Worked on machine learning models with Python
    """
    suggestions = internship_matcher.generate_cv_improvement_suggestions(cv, ["docker"], ["react"])
    for s in suggestions:
        bullet = s["suggested_bullet"]
        assert "[" not in bullet
        assert "X%" not in bullet
        # Verify bullet is grammatically complete with proper capitalization
        assert bullet[0].isupper()
        assert bullet.endswith(".")


# ─── 2. PROOF OF SKILL TESTS ──────────────────────────────────────────────────
def test_github_slug_parsing():
    parsed1 = proof_of_skill.parse_github_repo("https://github.com/facebook/react")
    assert parsed1["owner"] == "facebook"
    assert parsed1["repo"] == "react"

    parsed2 = proof_of_skill.parse_github_repo("torvalds/linux")
    assert parsed2["owner"] == "torvalds"
    assert parsed2["repo"] == "linux"

    assert proof_of_skill.parse_github_repo("invalid-not-a-repo") is None


def test_proof_of_skill_inspection_mock():
    # Test safe handling of non-existent or rate-limited repo
    result = proof_of_skill.inspect_repository("testowner/nonexistent-repo-12345", ["python", "react"])
    assert result["status"] in ("unable_to_verify", "not_found_in_inspected_files")
    assert "disclaimer" in result["note"].lower() or "proof-of-skill" in result["note"].lower()
    assert "evidence_breakdown" in result


# ─── 3. DOCUMENT INTEGRITY TESTS ──────────────────────────────────────────────
def test_clean_pdf_integrity():
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 50), "Candidate Resume: Kritgna Patel", fontname="helv", fontsize=12)
    doc.set_metadata({
        "creator": "LaTeX with hyperref",
        "producer": "pdfTeX-1.40.21",
        "creationDate": "D:20240501100000",
        "modDate": "D:20240501100000",
    })

    result = document_integrity.analyze_pdf_integrity(doc, "clean_resume.pdf")
    doc.close()

    assert result["status"] == "no_obvious_anomaly_detected"
    assert len(result["anomalies"]) == 0
    assert result["metadata_summary"]["page_count"] == 1
    assert len(result["checks_performed"]) >= 4


def test_pdf_with_anomalous_dates():
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Academic Record", fontsize=12)
    # Modification date precedes creation date by a year
    doc.set_metadata({
        "creator": "Adobe Acrobat",
        "producer": "iLovePDF Online Editor",
        "creationDate": "D:20250101100000",
        "modDate": "D:20230101100000",
    })

    result = document_integrity.analyze_pdf_integrity(doc, "modified_record.pdf")
    doc.close()

    assert result["status"] == "review_recommended"
    assert any(a["type"] == "chronological_inconsistency" for a in result["anomalies"])
    assert any(a["type"] == "post_export_editing_tool" for a in result["anomalies"])


# ─── 4. CONTEXTUAL CGPA COMPARISON TESTS ──────────────────────────────────────
def test_cgpa_context_comparison():
    from eligibility import compare_cgpa_with_context

    # 1. Matching cumulative CGPA
    m1 = compare_cgpa_with_context(8.56, 8.56)
    assert m1["status"] == "match"
    assert not m1["is_contradiction"]

    # 2. Resume has higher CGPA (subsequent semester progression vs earlier marksheet)
    m2 = compare_cgpa_with_context(8.56, 8.23)
    assert m2["status"] == "needs_review"
    assert "subsequent semester" in m2["message"]
    assert not m2["is_contradiction"]

    # 3. Marksheet has higher CGPA (e.g. 8.56 vs 8.1)
    m3 = compare_cgpa_with_context(8.10, 8.56)
    assert m3["status"] == "needs_review"
    assert "higher CGPA" in m3["message"]
    assert not m3["is_contradiction"]

    # 4. Marksheet has SGPA instead of cumulative CGPA
    m4 = compare_cgpa_with_context(8.56, None, marksheet_sgpa=8.85)
    assert m4["status"] == "needs_review"
    assert "SGPA" in m4["message"]

