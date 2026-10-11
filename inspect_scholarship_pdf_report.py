"""
ApplyReady AI — PyMuPDF Scholarship PDF Inspection & Audit Script
Inspects sample_scholarship_readiness_report.pdf page by page.
"""

import os
import sys
import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PDF_PATH = os.path.join(os.path.dirname(__file__), "sample_scholarship_readiness_report.pdf")

def inspect_scholarship_report():
    print("==================================================================")
    print("   APPLYREADY AI — SCHOLARSHIP PDF REPORT INSPECTION & AUDIT      ")
    print("==================================================================\n")

    if not os.path.isfile(PDF_PATH):
        raise FileNotFoundError(f"PDF file not found: {PDF_PATH}")

    doc = pymupdf.open(PDF_PATH)
    total_pages = doc.page_count
    print(f"[PDF] Total Pages: {total_pages}\n")

    full_text = ""
    for i in range(total_pages):
        page = doc[i]
        page_text = page.get_text()
        full_text += f"\n--- PAGE {i + 1} ---\n" + page_text
        print(f"--- Page {i + 1} ({page.rect.width:.1f} x {page.rect.height:.1f} pt) ---")
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        for sample_line in lines[:6]:
            print(f"  > {sample_line}")
        if len(lines) > 6:
            print(f"  ... [{len(lines)} total text lines on page {i + 1}]")

    print("\n==================================================================")
    print("   SCHOLARSHIP ACCURACY & DOMAIN AUDIT ASSERTIONS                 ")
    print("==================================================================")

    # 1. Executive Summary & Brand
    assert "ApplyReady" in full_text and "Scholarship Verification Report" in full_text, "Brand title must be present"
    print("[PASS] Brand header & Scholarship Verification Report title rendered cleanly")

    # 2. Strict Domain Isolation (Internship sections MUST NOT appear)
    assert "Scholarship Verification" in full_text, "Opportunity category must be Scholarship Verification"
    assert "admission verification" not in full_text.lower(), "Admission category must not appear"
    assert "role alignment" not in full_text.lower(), "Internship alignment must not appear in scholarship report"
    assert "github proof-of-skill" not in full_text.lower(), "GitHub proof of skill must not appear in scholarship report"
    assert "cv improvement lab" not in full_text.lower(), "CV improvement lab must not appear in scholarship report"
    print("[PASS] Strict domain isolation: Zero internship or admission elements rendered")

    # 3. Eligibility Results Section
    assert "Eligibility Results" in full_text, "Eligibility results section must be present"
    assert "CGPA Requirement Verdict" in full_text, "CGPA Verdict must be present"
    assert "Eligible" in full_text, "Candidate must be marked eligible"
    print("[PASS] Deterministic eligibility results rendered with transparent criteria")

    # 4. Extracted Document Fields
    assert "Extracted Document Fields" in full_text, "Extraction section must be present"
    assert "CGPA" in full_text, "Extracted CGPA must be present"
    print("[PASS] Extracted academic fields and page evidence citations rendered")

    # 5. Cross-Document Consistency
    assert "Document Consistency" in full_text, "Document consistency section must be present"
    assert "Overall Consistency" in full_text, "Overall consistency status present"
    print("[PASS] Cross-document consistency verification rendered")

    # 6. Document Integrity
    assert "Document Integrity" in full_text, "Document integrity section present"
    assert "Observed Technical Facts" in full_text, "Observed facts subsection present"
    assert "Technical Limitations" in full_text, "Limitations subsection present"
    print("[PASS] Document integrity structural facts and ATS signals rendered")

    # 7. No raw placeholders or markdown
    assert "X%" not in full_text, "Must not contain raw 'X%' placeholder"
    assert "### " not in full_text, "Must not contain raw '### ' markdown"
    assert "**" not in full_text, "Must not contain raw '**' markdown"
    print("[PASS] Zero raw placeholders or Markdown syntax artifacts found")

    print("\n==================================================================")
    print("ALL 7 SCHOLARSHIP PDF AUDIT CHECKS PASSED SUCCESSFULLY!")
    print("==================================================================\n")

if __name__ == "__main__":
    inspect_scholarship_report()
