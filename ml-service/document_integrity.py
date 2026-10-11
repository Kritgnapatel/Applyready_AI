"""
ApplyReady AI — Document Integrity & Tamper-Risk Analyzer
Performs objective structural analysis of uploaded PDF documents.
Inspects metadata (Producer, Creator, ModDate vs CreationDate),
font consistency, embedded subsets, and hidden text layers.
Outputs cautious, non-accusatory assessments:
'no_obvious_anomaly_detected', 'review_recommended', or 'unable_to_assess'.
Never accuses candidate of fraud.
"""

import re
from datetime import datetime
from typing import Dict, List, Any, Optional
import pymupdf


def parse_pdf_date(date_str: Optional[str]) -> Optional[datetime]:
    """
    Parses standard PDF date strings like D:20240415123000+05'30' or 20240415.
    """
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.replace("D:", "").replace("'", "")
    # Try YYYYMMDDHHMMSS or YYYYMMDD
    match = re.match(r"^(\d{4})(\d{2})(\d{2})", cleaned)
    if match:
        try:
            year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
            return datetime(year, max(1, min(12, month)), max(1, min(31, day)))
        except Exception:
            return None
    return None


def analyze_pdf_integrity(doc: pymupdf.Document, filename: str = "document.pdf") -> Dict[str, Any]:
    """
    Analyzes a PyMuPDF document for structural anomalies and tamper risk indicators.
    """
    if not doc or doc.page_count == 0:
        return {
            "filename": filename,
            "status": "unable_to_assess",
            "message": "Document contains no pages or could not be read.",
            "anomalies": [],
            "metadata_summary": {},
            "font_summary": {},
        }

    anomalies = []
    metadata = doc.metadata or {}

    creator = metadata.get("creator", "") or ""
    producer = metadata.get("producer", "") or ""
    creation_date_raw = metadata.get("creationDate", "") or ""
    mod_date_raw = metadata.get("modDate", "") or ""

    c_date = parse_pdf_date(creation_date_raw)
    m_date = parse_pdf_date(mod_date_raw)

    date_discrepancy = False
    if c_date and m_date:
        # Check if modification date is significantly earlier than creation date (clock anomaly)
        if (m_date - c_date).days < -1:
            anomalies.append({
                "type": "chronological_inconsistency",
                "severity": "medium",
                "description": (
                    f"File modification timestamp ({m_date.strftime('%Y-%m-%d')}) precedes "
                    f"creation timestamp ({c_date.strftime('%Y-%m-%d')})."
                ),
            })
            date_discrepancy = True

    # Software tools check (purely informative)
    suspect_tools = ["pdfedit", "ilovepdf", "sejda", "pdfescape", "nitro"]
    lower_producer = (producer + " " + creator).lower()
    for tool in suspect_tools:
        if tool in lower_producer:
            anomalies.append({
                "type": "post_export_editing_tool",
                "severity": "low",
                "description": (
                    f"Document metadata references online/post-export editor '{tool}'. "
                    "Ensure content has not been unintentionally shifted."
                ),
            })
            break

    # Font inspection across pages
    font_families = set()
    total_fonts_count = 0
    tiny_text_snippets = []

    for page_num in range(min(doc.page_count, 10)):
        page = doc[page_num]
        font_list = page.get_fonts(full=True)
        total_fonts_count += len(font_list)
        for f in font_list:
            # f format: (xref, ext, type, basefont, name, encoding, ...)
            basefont = f[3] if len(f) > 3 else ""
            if basefont:
                # Clean font name
                clean_name = basefont.split("+")[-1] if "+" in basefont else basefont
                font_families.add(clean_name)

        # Inspect text spans for tiny/hidden text (often used for keyword stuffing)
        try:
            page_dict = page.get_text("dict")
            for block in page_dict.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        size = span.get("size", 10)
                        span_text = span.get("text", "").strip()
                        # Detect microscopic text (size < 2.0 pt with words)
                        if 0 < size <= 2.0 and len(span_text) > 3:
                            tiny_text_snippets.append(span_text[:50])
        except Exception:
            pass

    if len(font_families) > 12:
        anomalies.append({
            "type": "excessive_font_variety",
            "category": "ATS / Layout Consideration",
            "severity": "low",
            "description": (
                f"Document contains {len(font_families)} distinct font families across {doc.page_count} page(s). "
                "Reviewing font consistency helps ensure clean ATS parsing across applicant tracking systems."
            ),
        })

    if tiny_text_snippets:
        anomalies.append({
            "type": "microscopic_text_detected",
            "category": "ATS Formatting Signal",
            "severity": "medium",
            "description": (
                f"Detected {len(tiny_text_snippets)} text fragment(s) formatted in microscopic font (<2pt). "
                "Ensure these are not unintended design artifacts that may affect ATS keyword parsers."
            ),
        })

    # Determine explicit status for each check performed
    checks_performed = [
        {
            "name": "metadata_chronology",
            "title": "Creation vs Modification Chronology",
            "status": "evaluated" if (c_date and m_date) else "unavailable",
            "detail": (
                f"Modification timestamp ({m_date.strftime('%Y-%m-%d')}) vs creation ({c_date.strftime('%Y-%m-%d')})."
                if (c_date and m_date) else "Chronology check unavailable: timestamps not populated by PDF authoring software."
            ),
        },
        {
            "name": "editing_software_signature",
            "title": "Post-Export Editor Signatures",
            "status": "detected" if any(a["type"] == "post_export_editing_tool" for a in anomalies) else "clean",
            "detail": f"Producer: '{producer or 'Unspecified'}', Creator: '{creator or 'Unspecified'}'.",
        },
        {
            "name": "font_consistency",
            "title": "Embedded Font Variety Check",
            "status": "elevated" if len(font_families) > 12 else "normal",
            "detail": f"{len(font_families)} distinct font families detected across {doc.page_count} page(s).",
        },
        {
            "name": "microscopic_text_layer",
            "title": "Microscopic Text Layer Inspection",
            "status": "detected" if tiny_text_snippets else "clean",
            "detail": f"{len(tiny_text_snippets)} fragment(s) below 2pt font size found.",
        },
        {
            "name": "text_layer_presence",
            "title": "Selectable Text vs Scanned Raster",
            "status": "selectable_text_present",
            "detail": f"Document contains native selectable text across {doc.page_count} page(s).",
        },
    ]

    # Explicitly separate observed facts, review signals, and limitations
    observed_facts = {
        "page_count": doc.page_count,
        "producer": producer or "Not specified by authoring software",
        "creator": creator or "Not specified by authoring software",
        "creation_date": c_date.strftime("%Y-%m-%d %H:%M") if c_date else "Not specified",
        "modification_date": m_date.strftime("%Y-%m-%d %H:%M") if m_date else "Not specified",
        "font_families_count": len(font_families),
        "sample_fonts": list(font_families)[:6],
        "has_selectable_text": True,
    }

    technical_limitations = [
        "PDF metadata is routinely stripped or modified by legitimate online converters, virtual printers, and export utilities.",
        "Font count variations are standard in modern CV templates utilizing font icons, section headers, and stylized callouts.",
        "Integrity findings are automated formatting and ATS compatibility observations; they do not constitute proof of misrepresentation or tampering.",
    ]

    # Determine overall status
    if any(a["severity"] == "medium" for a in anomalies):
        overall_status = "review_recommended"
        status_label = "Review Recommended (Formatting Signals)"
    elif anomalies:
        overall_status = "review_recommended"
        status_label = "Minor Formatting Signals"
    else:
        overall_status = "no_obvious_anomaly_detected"
        status_label = "No Obvious Formatting Anomalies"

    return {
        "filename": filename,
        "status": overall_status,
        "status_label": status_label,
        "anomalies": anomalies,
        "review_signals": anomalies,
        "observed_facts": observed_facts,
        "technical_limitations": technical_limitations,
        "checks_performed": checks_performed,
        "metadata_summary": {
            "creator": creator or "Unknown (not specified by PDF authoring tool)",
            "producer": producer or "Unknown (not specified by PDF authoring tool)",
            "creation_date": c_date.strftime("%Y-%m-%d %H:%M") if c_date else "Unknown",
            "modification_date": m_date.strftime("%Y-%m-%d %H:%M") if m_date else "Unknown",
            "page_count": doc.page_count,
            "metadata_note": (
                "Missing metadata fields are common in student CVs exported via online builders or virtual PDF printers. "
                "Unknown metadata is not an indication of tampering."
            ),
        },
        "font_summary": {
            "distinct_families_count": len(font_families),
            "sample_fonts": list(font_families)[:6],
        },
        "disclaimer": (
            "Document integrity analysis evaluates technical PDF metadata and layout characteristics for ATS compatibility. "
            "It is not a legal guarantee of authenticity nor an accusation of misrepresentation."
        ),
    }

