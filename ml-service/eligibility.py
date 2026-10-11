"""
ApplyReady AI — Eligibility Verification Engine
Deterministic rule-based checks. Not ML. Each check returns a structured result.
"""

from typing import Optional, Any


def _build_result(
    field: str,
    status: str,
    reason: str,
    actual_value: Any = None,
    required_value: Any = None,
    evidence: Any = None,
    severity: str = "medium",
    next_step: Optional[str] = None,
) -> dict:
    return {
        "field": field,
        "status": status,        # eligible | not_met | needs_review | missing
        "reason": reason,
        "actual_value": actual_value,
        "required_value": required_value,
        "evidence": evidence,
        "severity": severity,    # high | medium | low
        "next_step": next_step,
    }


def check_minimum_cgpa(
    extracted_cgpa: Optional[float],
    minimum_cgpa: Optional[float],
    evidence: Any = None,
) -> dict:
    """
    Check a minimum CGPA requirement using extracted evidence.
    Deterministic rule — not an ML prediction.
    Returns a top-level result (backward-compatible) plus field_results list.
    """
    field_result = _check_cgpa_field(extracted_cgpa, minimum_cgpa, evidence)

    # Backward-compatible flat result
    return {
        "status": field_result["status"],
        "reason": field_result["reason"],
        "actual_value": field_result["actual_value"],
        "required_value": field_result["required_value"],
        "evidence": field_result["evidence"],
        "field_results": [field_result],
    }


def _check_cgpa_field(
    extracted_cgpa: Optional[float],
    minimum_cgpa: Optional[float],
    evidence: Any = None,
) -> dict:
    if minimum_cgpa is None or not isinstance(minimum_cgpa, (int, float)):
        return _build_result(
            field="cgpa",
            status="needs_review",
            reason="Minimum CGPA requirement is missing or invalid.",
            actual_value=extracted_cgpa,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="low",
            next_step="Provide the minimum CGPA requirement in the requirements field.",
        )

    if not 0 <= minimum_cgpa <= 10:
        return _build_result(
            field="cgpa",
            status="needs_review",
            reason="Minimum CGPA must be between 0 and 10.",
            actual_value=extracted_cgpa,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="low",
            next_step="Verify the CGPA requirement from the official opportunity page.",
        )

    if extracted_cgpa is None:
        return _build_result(
            field="cgpa",
            status="missing",
            reason="CGPA could not be extracted from the document.",
            actual_value=None,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="high",
            next_step=(
                "Ensure your resume or marksheet clearly states your CGPA "
                "with a label such as 'CGPA: 8.5'."
            ),
        )

    try:
        actual = float(extracted_cgpa)
    except (TypeError, ValueError):
        actual = -1.0

    if not 0 <= actual <= 10:
        return _build_result(
            field="cgpa",
            status="needs_review",
            reason="Extracted CGPA is invalid or uses an unsupported scale.",
            actual_value=extracted_cgpa,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="medium",
            next_step="Verify the CGPA value in your document. If it uses a 4.0 scale, manual review is needed.",
        )

    if actual >= minimum_cgpa:
        return _build_result(
            field="cgpa",
            status="eligible",
            reason=f"Extracted CGPA {actual:.2f} meets the minimum requirement of {minimum_cgpa:.2f}.",
            actual_value=actual,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="low",
        )
    else:
        gap = minimum_cgpa - actual
        return _build_result(
            field="cgpa",
            status="not_met",
            reason=(
                f"Extracted CGPA {actual:.2f} is below the "
                f"minimum requirement of {minimum_cgpa:.2f} (gap: {gap:.2f})."
            ),
            actual_value=actual,
            required_value=minimum_cgpa,
            evidence=evidence,
            severity="high",
            next_step=(
                "Your CGPA does not meet the stated minimum. "
                "Verify the requirement and check if any relaxation applies."
            ),
        )


def check_graduation_year(
    extracted_year: Optional[int],
    required_year: Optional[int],
    evidence: Any = None,
) -> dict:
    """Check whether the student's graduation year matches the requirement."""
    if required_year is None:
        return _build_result(
            field="graduation_year",
            status="needs_review",
            reason="No graduation year requirement was found.",
            actual_value=extracted_year,
            required_value=required_year,
            severity="low",
            next_step="Confirm whether a specific graduation year is required.",
        )

    if extracted_year is None:
        return _build_result(
            field="graduation_year",
            status="missing",
            reason="Graduation year could not be extracted from your documents.",
            actual_value=None,
            required_value=required_year,
            evidence=evidence,
            severity="medium",
            next_step=(
                "Add your graduation year to your resume, "
                "e.g. 'Batch of 2026' or 'Graduation Year: 2026'."
            ),
        )

    if extracted_year == required_year:
        return _build_result(
            field="graduation_year",
            status="eligible",
            reason=f"Graduation year {extracted_year} matches the requirement.",
            actual_value=extracted_year,
            required_value=required_year,
            evidence=evidence,
            severity="low",
        )
    else:
        return _build_result(
            field="graduation_year",
            status="not_met",
            reason=f"Your graduation year ({extracted_year}) does not match the required year ({required_year}).",
            actual_value=extracted_year,
            required_value=required_year,
            evidence=evidence,
            severity="high",
            next_step="Confirm whether this opportunity accepts your graduation year.",
        )


def check_required_documents(
    uploaded_document_types: list,
    required_document_types: list,
) -> list:
    """
    Check completeness of required documents.
    uploaded_document_types: list of uploaded field names e.g. ["resume", "marksheet"]
    required_document_types: list of required doc types from extracted criteria
    Returns list of field results.
    """
    results = []
    UPLOAD_FIELD_MAP = {
        "resume": ["resume", "cv", "curriculum vitae"],
        "marksheet": ["marksheet", "mark sheet", "transcript", "grade sheet"],
        "certificate": ["certificate", "recommendation letter"],
    }

    for required_type in required_document_types:
        req_lower = required_type.lower()
        found = False
        for field, aliases in UPLOAD_FIELD_MAP.items():
            if any(a in req_lower for a in aliases):
                if field in uploaded_document_types:
                    found = True
                break
        results.append(
            _build_result(
                field=f"document_{req_lower.replace(' ', '_')}",
                status="eligible" if found else "missing",
                reason=(
                    f"'{required_type}' was provided."
                    if found
                    else f"Required document '{required_type}' was not uploaded."
                ),
                actual_value=field if found else None,
                required_value=required_type,
                severity="high" if not found else "low",
                next_step=(
                    None
                    if found
                    else f"Upload your '{required_type}' to complete this requirement."
                ),
            )
        )
    return results


DEGREE_EQUIVALENCES = {
    "b.tech": ["b.tech", "bachelor of technology", "btech", "b.e", "b.e.", "bachelor of engineering", "be"],
    "bachelor of technology": ["b.tech", "bachelor of technology", "btech", "b.e", "b.e.", "bachelor of engineering"],
    "b.e": ["b.tech", "bachelor of technology", "btech", "b.e", "b.e.", "bachelor of engineering"],
    "m.tech": ["m.tech", "master of technology", "mtech", "m.e", "master of engineering"],
    "m.sc": ["m.sc", "master of science", "msc"],
    "b.sc": ["b.sc", "bachelor of science", "bsc"],
    "mba": ["mba", "master of business administration"],
    "mca": ["mca", "master of computer applications"],
}


def are_degrees_equivalent(deg1: Optional[str], deg2: Optional[str]) -> bool:
    """Return True if two degree strings represent equivalent academic degrees."""
    if not deg1 or not deg2:
        return False
    d1 = str(deg1).lower().strip()
    d2 = str(deg2).lower().strip()
    if d1 == d2 or d1 in d2 or d2 in d1:
        return True
    for group in DEGREE_EQUIVALENCES.values():
        if any(k in d1 for k in group) and any(k in d2 for k in group):
            return True
    return False


def check_degree(
    extracted_degree: Optional[str],
    required_degrees: list,
    evidence: Any = None,
) -> dict:
    """Check whether the student's degree satisfies any of the required degrees."""
    if not required_degrees:
        return _build_result(
            field="degree",
            status="needs_review",
            reason="No degree requirement was specified.",
            actual_value=extracted_degree,
            required_value=None,
            severity="low",
            next_step="Confirm whether a specific degree is required.",
        )

    if not extracted_degree:
        return _build_result(
            field="degree",
            status="missing",
            reason="Degree could not be extracted from your documents.",
            actual_value=None,
            required_value=", ".join(required_degrees),
            evidence=evidence,
            severity="medium",
            next_step="Ensure your degree (e.g. B.Tech, B.E., B.Sc) is clearly stated in your resume.",
        )

    ext_norm = str(extracted_degree).lower().strip()
    match_found = False

    for req in required_degrees:
        if are_degrees_equivalent(ext_norm, req):
            match_found = True
            break

    if match_found:
        return _build_result(
            field="degree",
            status="eligible",
            reason=f"Degree '{extracted_degree}' satisfies the requirement ({', '.join(required_degrees)}).",
            actual_value=extracted_degree,
            required_value=", ".join(required_degrees),
            evidence=evidence,
            severity="low",
        )
    else:
        return _build_result(
            field="degree",
            status="not_met",
            reason=f"Degree '{extracted_degree}' does not match stated requirement ({', '.join(required_degrees)}).",
            actual_value=extracted_degree,
            required_value=", ".join(required_degrees),
            evidence=evidence,
            severity="medium",
            next_step="Verify whether your degree specialization is eligible for this opportunity.",
        )


def check_all(
    extracted_fields: dict,
    requirement_criteria: list,
    uploaded_document_types: list,
) -> dict:
    """
    Run all eligibility checks based on extracted criteria.
    Returns a structured report with per-field results and an overall status.
    """
    field_results = []

    # CGPA check
    cgpa_req = next((c for c in requirement_criteria if c.get("type") == "minimum_cgpa"), None)
    if cgpa_req or extracted_fields.get("cgpa") is not None:
        result = _check_cgpa_field(
            extracted_cgpa=extracted_fields.get("cgpa"),
            minimum_cgpa=cgpa_req["value"] if cgpa_req else None,
            evidence=cgpa_req.get("evidence") if cgpa_req else None,
        )
        field_results.append(result)

    # Graduation year check
    grad_req = next((c for c in requirement_criteria if c.get("type") == "graduation_year"), None)
    if grad_req or extracted_fields.get("graduation_year") is not None:
        result = check_graduation_year(
            extracted_year=extracted_fields.get("graduation_year"),
            required_year=grad_req["value"] if grad_req else None,
            evidence=grad_req.get("evidence") if grad_req else None,
        )
        field_results.append(result)

    # Degree check
    degree_reqs = [
        c["value"] for c in requirement_criteria if c.get("type") == "required_degree"
    ]
    if degree_reqs or extracted_fields.get("degree"):
        deg_res = check_degree(
            extracted_degree=extracted_fields.get("degree"),
            required_degrees=degree_reqs,
            evidence=next((c.get("evidence") for c in requirement_criteria if c.get("type") == "required_degree"), None),
        )
        field_results.append(deg_res)

    # Document completeness check
    required_docs = [
        c["value"] for c in requirement_criteria if c.get("type") == "required_document"
    ]
    if required_docs:
        doc_results = check_required_documents(uploaded_document_types, required_docs)
        field_results.extend(doc_results)

    # Overall status
    statuses = [r["status"] for r in field_results]
    if "not_met" in statuses:
        overall = "not_met"
    elif "missing" in statuses:
        overall = "missing"
    elif "needs_review" in statuses or not statuses:
        overall = "needs_review"
    else:
        overall = "eligible"

    return {
        "overall_status": overall,
        "field_results": field_results,
        "summary": {
            "eligible": statuses.count("eligible"),
            "not_met": statuses.count("not_met"),
            "missing": statuses.count("missing"),
            "needs_review": statuses.count("needs_review"),
        },
    }


def compare_cgpa_with_context(
    resume_cgpa: Any,
    marksheet_cgpa: Any,
    marksheet_sgpa: Any = None,
    resume_evidence: Any = None,
    marksheet_evidence: Any = None,
    academic_session: Any = None,
) -> dict:
    """
    Compares CGPA between resume and marksheet considering academic context:
    - Distinguishes semester SGPA vs cumulative CGPA.
    - Recognizes progression: an updated cumulative CGPA on a resume reflecting subsequent
      semesters is not an automatic contradiction with an earlier semester grade card.
    - Returns 'needs_review' with clear actionable guidance rather than asserting a false mismatch.
    - Returns 'mismatch' only when there is an explicit contradiction for the identical term or invalid scale.
    """
    if resume_cgpa is None and marksheet_cgpa is None and marksheet_sgpa is None:
        return {
            "status": "needs_review",
            "message": "CGPA was not found in either document.",
            "resume_value": None,
            "marksheet_value": None,
            "is_contradiction": False,
        }

    if resume_cgpa is None or (marksheet_cgpa is None and marksheet_sgpa is None):
        return {
            "status": "needs_review",
            "message": f"CGPA found in only one document (resume: {resume_cgpa}, marksheet: {marksheet_cgpa or marksheet_sgpa}).",
            "resume_value": resume_cgpa,
            "marksheet_value": marksheet_cgpa or marksheet_sgpa,
            "is_contradiction": False,
        }

    try:
        r_f = float(resume_cgpa)
    except (TypeError, ValueError):
        return {
            "status": "needs_review",
            "message": f"Resume CGPA '{resume_cgpa}' is not a valid number.",
            "resume_value": resume_cgpa,
            "marksheet_value": marksheet_cgpa,
            "is_contradiction": False,
        }

    # If marksheet has cumulative CGPA
    if marksheet_cgpa is not None:
        try:
            m_f = float(marksheet_cgpa)
        except (TypeError, ValueError):
            return {
                "status": "needs_review",
                "message": f"Marksheet CGPA '{marksheet_cgpa}' is not a valid number.",
                "resume_value": resume_cgpa,
                "marksheet_value": marksheet_cgpa,
                "is_contradiction": False,
            }

        # Check scale validity (0.0 to 10.0 standard scale)
        if not (0.0 <= r_f <= 10.0 and 0.0 <= m_f <= 10.0):
            return {
                "status": "needs_review",
                "message": f"CGPA value out of standard 10.0 scale (resume: {r_f}, marksheet: {m_f}). Verify grading scale.",
                "resume_value": resume_cgpa,
                "marksheet_value": marksheet_cgpa,
                "is_contradiction": False,
            }

        if abs(r_f - m_f) < 0.01:
            return {
                "status": "match",
                "message": f"CGPA verified: resume and marksheet reflect identical cumulative CGPA ({r_f:.2f}).",
                "resume_value": r_f,
                "marksheet_value": m_f,
                "is_contradiction": False,
            }
        elif r_f > m_f:
            # Resume cumulative CGPA is higher than the uploaded marksheet
            return {
                "status": "needs_review",
                "message": (
                    f"Resume states cumulative CGPA {r_f:.2f}, while uploaded marksheet shows {m_f:.2f}. "
                    "If the uploaded marksheet is from an earlier semester and your resume includes subsequent semester results, "
                    "please provide your latest consolidated transcript to substantiate the updated cumulative CGPA."
                ),
                "resume_value": r_f,
                "marksheet_value": m_f,
                "is_contradiction": False,
            }
        else:
            # Marksheet CGPA is higher than resume (e.g. resume shows 8.1, marksheet shows 8.56)
            return {
                "status": "needs_review",
                "message": (
                    f"Uploaded marksheet indicates higher CGPA {m_f:.2f}, while resume states {r_f:.2f}. "
                    "Ensure your resume is updated to reflect your latest academic grade."
                ),

                "resume_value": r_f,
                "marksheet_value": m_f,
                "is_contradiction": False,
            }

    # If marksheet only has SGPA (semester-specific grade)
    if marksheet_sgpa is not None:
        try:
            sgpa_f = float(marksheet_sgpa)
            if abs(r_f - sgpa_f) < 0.01:
                return {
                    "status": "match",
                    "message": f"Resume CGPA matches marksheet semester SGPA ({r_f:.2f}).",
                    "resume_value": r_f,
                    "marksheet_value": sgpa_f,
                    "is_contradiction": False,
                }
            else:
                return {
                    "status": "needs_review",
                    "message": (
                        f"Resume states cumulative CGPA {r_f:.2f}, while uploaded marksheet records semester SGPA {sgpa_f:.2f}. "
                        "Semester SGPA reflects a single term, whereas resume CGPA represents multi-semester cumulative performance. "
                        "Upload a consolidated transcript to verify cumulative CGPA."
                    ),
                    "resume_value": r_f,
                    "marksheet_value": sgpa_f,
                    "is_contradiction": False,
                }
        except (TypeError, ValueError):
            pass

    return {
        "status": "needs_review",
        "message": f"Could not establish conclusive CGPA alignment between resume ({resume_cgpa}) and marksheet ({marksheet_cgpa}).",
        "resume_value": resume_cgpa,
        "marksheet_value": marksheet_cgpa,
        "is_contradiction": False,
    }

