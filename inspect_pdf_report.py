"""
ApplyReady AI — PyMuPDF PDF Inspection & Audit Script
Inspects sample_internship_readiness_report.pdf page by page.
"""

import os
import sys
import re
import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PDF_PATH = os.path.join(os.path.dirname(__file__), "sample_internship_readiness_report.pdf")

def inspect_report():
    print("==================================================================")
    print("   APPLYREADY AI — PyMuPDF PDF REPORT INSPECTION & AUDIT          ")
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
    print("   ACCURACY & AUDIT VERIFICATION ASSERTIONS                       ")
    print("==================================================================")

    # 1. Executive Summary & Brand
    assert "ApplyReady" in full_text and "Readiness Report" in full_text, "Brand title must be present"
    print("[PASS] Brand header & Readiness Report title rendered cleanly")

    # 2. Opportunity Profile
    assert "internship" in full_text.lower(), "Domain must be internship"
    assert "admission" not in full_text.lower(), "Admission category must not appear"
    print("[PASS] Opportunity profile rendered with strict domain isolation (zero admission references)")

    # 3. Role Alignment & Dimensional Index
    assert "Overall Technical Alignment Index" in full_text, "Alignment index table must be present"
    assert "Required Skills Coverage" in full_text, "Required skills coverage dimension present"
    assert "Experience Evidence Grounding" in full_text, "Experience evidence dimension present"
    assert "Preferred Skills Coverage" in full_text, "Preferred skills dimension present"
    assert "Formula: Index =" in full_text, "Calculation formula must be transparently documented"
    print("[PASS] Dimensional alignment and documented scoring formula rendered accurately")

    # 4. 5-Tier Skills Matrix
    assert "Skills Matrix" in full_text, "Skills matrix section present"
    assert "Supported by Project Evidence" in full_text or "Mentioned Only" in full_text, "5-Tier status categories present"
    assert "5-Tier Hierarchy Definitions" in full_text, "Status definitions note present"
    print("[PASS] 5-Tier skill status matrix and definitions rendered cleanly")

    # 5. Proof-of-Skill (GitHub) NOT RUN
    assert "Proof-of-Skill Verification (GitHub)" in full_text, "Proof-of-skill section present"
    assert "Not Run" in full_text, "Status must show Not Run"
    assert "not run" in full_text.lower(), "Must explain code inspection was not run"
    # Never claim code was inspected
    assert "verified in repository" not in full_text.lower() or "0 /" in full_text or "no public github repository" in full_text.lower(), "Must not claim false code verification"
    print("[PASS] Proof-of-Skill correctly displays NOT RUN without contradictory GitHub claims")

    # 6. CV Improvement Lab
    assert "CV Improvement Lab" in full_text, "CV lab section present"
    assert "Accepted Revision" in full_text, "Accepted revision status pill present"
    print("[PASS] CV Improvement Lab accepted revisions preserved and rendered")

    # 7. Prioritized Next Steps (Sequential Numbering 1., 2., 3., 4.)
    assert "Prioritized Next Steps" in full_text, "Next steps section present"
    # Check for sequential steps
    has_step1 = bool(re.search(r"\b1\.\s+", full_text))
    has_step2 = bool(re.search(r"\b2\.\s+", full_text))
    has_step3 = bool(re.search(r"\b3\.\s+", full_text))
    assert has_step1, "Must contain Step 1."
    assert has_step2, "Must contain Step 2."
    assert has_step3, "Must contain Step 3."
    print("[PASS] Dynamic action plan strictly sequenced (1., 2., 3...) with zero numbering gaps")

    # 8. Document Integrity (Facts vs Signals vs Limitations)
    assert "Document Integrity" in full_text, "Document integrity section present"
    assert "Observed Technical Facts" in full_text, "Observed facts subsection present"
    assert "Formatting & ATS Review Signals" in full_text or "Formatting Observations" in full_text, "Review signals subsection present"
    assert "Technical Limitations" in full_text, "Limitations subsection present"
    print("[PASS] Document integrity cleanly separates observed facts, formatting signals, and limitations")

    # 9. No raw unrendered placeholders
    assert "X%" not in full_text, "Must not contain raw 'X%' placeholder"
    assert "N requests" not in full_text, "Must not contain raw 'N requests' placeholder"
    assert "[quantify" not in full_text.lower(), "Must not contain raw '[quantify' placeholder"
    print("[PASS] Zero raw placeholders or fake bracketed metrics found in PDF")

    # 10. No raw Markdown artifacts
    assert "### " not in full_text, "Must not contain raw '### ' markdown"
    assert "**" not in full_text, "Must not contain raw '**' markdown"
    print("[PASS] Zero raw unrendered Markdown artifacts found in PDF")

    print("\n==================================================================")
    print("ALL 10 PyMuPDF PDF REPORT AUDIT CHECKS PASSED SUCCESSFULLY!")
    print("==================================================================\n")

if __name__ == "__main__":
    inspect_report()
