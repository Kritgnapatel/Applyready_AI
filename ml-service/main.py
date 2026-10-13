"""
ApplyReady AI — FastAPI ML Service
Handles PDF extraction, eligibility verification, document comparison,
classification (TF-IDF/keyword fallback), and grounded GenAI explanations.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Any
import pymupdf
import extractor
import requirements_extractor
from eligibility import check_minimum_cgpa, check_all, are_degrees_equivalent, compare_cgpa_with_context
import internship_matcher
import proof_of_skill
import document_integrity

# Optional modules — gracefully unavailable
try:
    import classifier
    CLASSIFIER_AVAILABLE = True
except Exception as _e:
    CLASSIFIER_AVAILABLE = False
    print(f"[main] classifier unavailable: {_e}")

try:
    import genai_client
    GENAI_AVAILABLE = True
except Exception as _e:
    GENAI_AVAILABLE = False
    print(f"[main] genai_client unavailable: {_e}")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ApplyReady AI ML Service",
    description=(
        "Document processing, evidence-based extraction, "
        "eligibility verification, and grounded GenAI explanations."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


# ─── MODELS ───────────────────────────────────────────────────────────────────
class EligibilityRequest(BaseModel):
    extracted_cgpa: Optional[float] = None
    minimum_cgpa: Optional[float] = None
    extracted_graduation_year: Optional[int] = None
    extracted_fields: Optional[dict] = None
    requirement_criteria: Optional[List[dict]] = None


class RequirementsTextRequest(BaseModel):
    text: str


class GenAIRequest(BaseModel):
    opportunity_name: Optional[str] = "Opportunity"
    domain: Optional[str] = "scholarship"
    eligibility_result: Optional[dict] = None
    field_results: Optional[List[dict]] = None
    comparison_result: Optional[dict] = None
    requirements_text: Optional[str] = None
    internship_analysis: Optional[dict] = None
    proof_of_skill: Optional[dict] = None
    document_integrity: Optional[dict] = None


class InternshipMatchRequest(BaseModel):
    jd_text: Optional[str] = ""
    cv_text: str
    opportunity_name: Optional[str] = ""
    proof_of_skill: Optional[dict] = None


class ProofOfSkillRequest(BaseModel):
    github_url: str
    claimed_skills: Optional[List[str]] = None


# ─── HELPERS ──────────────────────────────────────────────────────────────────
async def open_pdf_document(file: UploadFile) -> pymupdf.Document:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF must be 5 MB or smaller.")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        doc = pymupdf.open(stream=content, filetype="pdf")
        if doc.page_count == 0:
            doc.close()
            raise HTTPException(status_code=400, detail="The PDF has no pages.")
        return doc
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF. It may be invalid or password-protected.",
        )


# ─── HEALTH ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "OK",
        "service": "ApplyReady AI ML Service",
        "version": "2.0.0",
        "sklearn_available": CLASSIFIER_AVAILABLE and getattr(classifier, "SKLEARN_AVAILABLE", False),
        "genai_available": GENAI_AVAILABLE,
        "classifier_model_ready": CLASSIFIER_AVAILABLE and getattr(classifier, "_model_ready", False),
    }


# ─── PDF TEXT EXTRACTION ──────────────────────────────────────────────────────
@app.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    doc = await open_pdf_document(file)
    try:
        pages = [
            {"page": page_num, "text": page.get_text()}
            for page_num, page in enumerate(doc, start=1)
        ]
        extracted_text = "\n".join(p["text"] for p in pages)
        return {
            "filename": file.filename,
            "page_count": len(pages),
            "text": extracted_text,
            "pages": pages,
            "extraction_method": "text-based PDF extraction",
        }
    finally:
        doc.close()


# ─── FIELD EXTRACTION ────────────────────────────────────────────────────────
@app.post("/extract-fields")
async def extract_fields_endpoint(file: UploadFile = File(...)):
    doc = await open_pdf_document(file)
    try:
        fields, evidence, is_scanned = extractor.extract_document_data(doc)

        if is_scanned:
            note_msg = (
                "Document appears to be scanned or contains no extractable text. "
                "OCR is required for accurate extraction."
            )
        else:
            note_msg = (
                "Rule-based extraction using layout and table analysis. "
                "Missing fields mean no supported labelled pattern was found."
            )

        return {
            "filename": file.filename,
            "fields": fields,
            "evidence": evidence,
            "raw_text": "\n".join(page.get_text() for page in doc),
            "is_scanned": is_scanned,
            "extraction_method": "rule-based layout and table extraction",
            "note": note_msg,
        }
    finally:
        doc.close()


# ─── ELIGIBILITY CHECK ────────────────────────────────────────────────────────
@app.post("/check-eligibility")
def check_eligibility(request: EligibilityRequest):
    # If we have full criteria, run comprehensive check
    if request.requirement_criteria and request.extracted_fields:
        uploaded_types = []
        if request.extracted_fields.get("cgpa") is not None:
            uploaded_types.append("resume")

        comprehensive = check_all(
            extracted_fields=request.extracted_fields,
            requirement_criteria=request.requirement_criteria,
            uploaded_document_types=uploaded_types,
        )

        # Also run standard CGPA check for backward compatibility
        cgpa_result = check_minimum_cgpa(
            extracted_cgpa=request.extracted_cgpa,
            minimum_cgpa=request.minimum_cgpa,
        )

        return {
            **cgpa_result,
            "comprehensive": comprehensive,
        }

    return check_minimum_cgpa(
        extracted_cgpa=request.extracted_cgpa,
        minimum_cgpa=request.minimum_cgpa,
    )


# ─── VERIFY CGPA (combined endpoint) ─────────────────────────────────────────
@app.post("/verify-cgpa")
async def verify_cgpa(
    file: UploadFile = File(...),
    minimum_cgpa: float = 8.0,
):
    doc = await open_pdf_document(file)
    try:
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        result = check_minimum_cgpa(
            extracted_cgpa=fields.get("cgpa"),
            minimum_cgpa=minimum_cgpa,
            evidence=evidence.get("cgpa"),
        )
        return {
            "filename": file.filename,
            "extracted_fields": fields,
            "cgpa_evidence": evidence.get("cgpa"),
            "is_scanned": is_scanned,
            "eligibility": result,
        }
    finally:
        doc.close()


# ─── DOCUMENT COMPARISON ──────────────────────────────────────────────────────
@app.post("/compare-documents")
async def compare_documents(
    resume: UploadFile = File(...),
    marksheet: UploadFile = File(...),
):
    resume_doc = await open_pdf_document(resume)
    marksheet_doc = None

    try:
        marksheet_doc = await open_pdf_document(marksheet)

        resume_fields, resume_evidence, resume_scanned = extractor.extract_document_data(resume_doc)
        marksheet_fields, marksheet_evidence, marksheet_scanned = extractor.extract_document_data(marksheet_doc)

        comparisons = {}
        comparable_fields = ["degree", "cgpa", "admission_year", "graduation_year", "sgpa", "academic_year"]

        for field_name in comparable_fields:
            r_val = resume_fields.get(field_name)
            m_val = marksheet_fields.get(field_name)
            r_ev = resume_evidence.get(field_name)
            m_ev = marksheet_evidence.get(field_name)

            if r_val is None and m_val is None:
                # Neither found — skip silently
                continue

            if field_name == "degree":
                if r_val and m_val:
                    if are_degrees_equivalent(r_val, m_val):
                        status = "match"
                        message = f"Degree verified: resume ('{r_val}') and marksheet ('{m_val}') represent equivalent academic degrees."
                    else:
                        status = "mismatch"
                        message = f"Degree discrepancy: resume shows '{r_val}', marksheet shows '{m_val}'."
                else:
                    status = "needs_review"
                    message = f"Degree found in only one document (resume: {r_val}, marksheet: {m_val})."

            elif field_name in ("sgpa", "academic_year"):
                # Marksheet-specific fields: resumes typically do not include semester-specific SGPA or academic session
                if r_val is not None and m_val is not None:
                    if str(r_val).strip() == str(m_val).strip():
                        status = "match"
                        message = f"Values match between resume and marksheet ({r_val})."
                    else:
                        status = "mismatch"
                        message = f"Discrepancy: resume shows {r_val}, marksheet shows {m_val}."
                elif m_val is not None:
                    status = "match"
                    message = f"Verified from marksheet ({m_val}). Marksheet-specific field."
                else:
                    status = "needs_review"
                    message = f"Recorded in resume ({r_val}), but not found on marksheet."

            elif field_name == "cgpa":
                cgpa_eval = compare_cgpa_with_context(
                    resume_cgpa=r_val,
                    marksheet_cgpa=m_val,
                    marksheet_sgpa=marksheet_fields.get("sgpa"),
                    resume_evidence=r_ev,
                    marksheet_evidence=m_ev,
                    academic_session=marksheet_fields.get("academic_year"),
                )
                status = cgpa_eval["status"]
                message = cgpa_eval["message"]

            elif field_name in ("admission_year", "graduation_year"):
                if r_val is not None and m_val is not None:
                    try:
                        if int(r_val) == int(m_val):
                            status = "match"
                            message = f"Values match between resume and marksheet ({r_val})."
                        else:
                            status = "mismatch"
                            message = f"Discrepancy: resume shows {r_val}, marksheet shows {m_val}."
                    except (TypeError, ValueError):
                        if str(r_val).strip() == str(m_val).strip():
                            status = "match"
                            message = f"Values match between resume and marksheet ({r_val})."
                        else:
                            status = "mismatch"
                            message = f"Discrepancy: resume shows {r_val}, marksheet shows {m_val}."
                else:
                    status = "needs_review"
                    message = f"Field '{field_name}' was not found in both documents (resume: {r_val}, marksheet: {m_val})."

            else:
                if str(r_val).strip() == str(m_val).strip():
                    status = "match"
                    message = f"Values match between resume and marksheet ({r_val})."
                else:
                    status = "mismatch"
                    message = f"Discrepancy: resume shows {r_val}, marksheet shows {m_val}."

            comparisons[field_name] = {
                "status": status,
                "message": message,
                "resume_value": r_val,
                "marksheet_value": m_val,
                "resume_evidence": r_ev,
                "marksheet_evidence": m_ev,
            }

        core_fields = ["degree", "cgpa", "admission_year", "graduation_year"]
        core_statuses = [comparisons[f]["status"] for f in core_fields if f in comparisons]
        all_statuses = [v["status"] for v in comparisons.values()]

        if "mismatch" in all_statuses:
            overall_status = "mismatch"
        elif any(s == "needs_review" for s in core_statuses):
            overall_status = "needs_review"
        elif "match" in all_statuses:
            overall_status = "match"
        else:
            overall_status = "needs_review"

        return {
            "overall_status": overall_status,
            "comparisons": comparisons,
            "documents": {
                "resume": {"filename": resume.filename, "is_scanned": resume_scanned},
                "marksheet": {"filename": marksheet.filename, "is_scanned": marksheet_scanned},
            },
            "summary": {
                "matches": all_statuses.count("match"),
                "mismatches": all_statuses.count("mismatch"),
                "needs_review": all_statuses.count("needs_review"),
                "compared_fields": len(all_statuses),
            },
            "note": (
                "Comparison uses rule-based evidence extraction. "
                "A mismatch indicates a discrepancy between documents. "
                "Missing fields are flagged for manual review."
            ),
        }
    finally:
        resume_doc.close()
        if marksheet_doc is not None:
            marksheet_doc.close()


# ─── REQUIREMENTS EXTRACTION ──────────────────────────────────────────────────
@app.post("/extract-requirements")
def extract_requirements_endpoint(request: RequirementsTextRequest):
    return requirements_extractor.extract_requirements(request.text)


@app.post("/extract-requirements-pdf")
async def extract_requirements_pdf(file: UploadFile = File(...)):
    doc = await open_pdf_document(file)
    try:
        extracted_text = "\n".join(page.get_text() for page in doc)

        if not extracted_text.strip():
            return {
                "status": "needs_review",
                "minimum_cgpa": None,
                "evidence": None,
                "criteria": [],
                "message": (
                    "No selectable text found in the PDF. "
                    "OCR or manual entry is required."
                ),
            }

        result = requirements_extractor.extract_requirements(extracted_text)
        return {
            **result,
            "filename": file.filename,
            "extraction_method": "text-based PDF extraction",
        }
    finally:
        doc.close()


# ─── DOCUMENT CLASSIFICATION ──────────────────────────────────────────────────
@app.post("/classify-document")
async def classify_document(file: UploadFile = File(...)):
    if not CLASSIFIER_AVAILABLE:
        return {
            "predicted_type": "unknown",
            "confidence": 0.0,
            "method": "unavailable",
            "review_recommended": True,
            "note": "Classifier module could not be loaded.",
        }

    doc = await open_pdf_document(file)
    try:
        # Extract text for classification
        full_text = "\n".join(page.get_text() for page in doc)
        is_scanned = len(full_text.strip()) < 30

        if is_scanned:
            return {
                "predicted_type": "unknown",
                "confidence": 0.0,
                "method": "scanned_document",
                "review_recommended": True,
                "is_scanned": True,
                "note": "Document appears to be scanned. Text extraction not possible.",
            }

        result = classifier.predict_document_type(full_text)
        result["filename"] = file.filename
        result["is_scanned"] = False
        return result
    finally:
        doc.close()


# ─── GENAI EXPLANATION ────────────────────────────────────────────────────────
@app.post("/genai-explain")
def genai_explain(request: GenAIRequest):
    if not GENAI_AVAILABLE:
        return {
            "available": False,
            "text": None,
            "method": "unavailable",
            "note": "GenAI client module could not be loaded.",
        }

    return genai_client.explain_verification_results(
        opportunity_name=request.opportunity_name,
        domain=request.domain,
        eligibility_result=request.eligibility_result,
        field_results=request.field_results,
        comparison_result=request.comparison_result,
        requirements_text=request.requirements_text,
        internship_analysis=request.internship_analysis,
        proof_of_skill=request.proof_of_skill,
        document_integrity=request.document_integrity,
    )


# ─── INTERNSHIP INTELLIGENCE ──────────────────────────────────────────────────
@app.post("/analyze-internship")
def analyze_internship_endpoint(request: InternshipMatchRequest):
    return internship_matcher.match_internship(
        jd_text=request.jd_text or "",
        cv_text=request.cv_text,
        opportunity_name=request.opportunity_name or "",
        proof_of_skill=request.proof_of_skill,
    )


# ─── PROOF OF SKILL (GITHUB) ──────────────────────────────────────────────────
@app.post("/verify-skills")
def verify_skills_endpoint(request: ProofOfSkillRequest):
    return proof_of_skill.inspect_repository(
        github_url_or_slug=request.github_url,
        claimed_skills=request.claimed_skills,
    )


# ─── DOCUMENT INTEGRITY & TAMPER RISK ─────────────────────────────────────────
@app.post("/analyze-integrity")
async def analyze_integrity_endpoint(file: UploadFile = File(...)):
    doc = await open_pdf_document(file)
    try:
        return document_integrity.analyze_pdf_integrity(doc, filename=file.filename)
    finally:
        doc.close()


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

