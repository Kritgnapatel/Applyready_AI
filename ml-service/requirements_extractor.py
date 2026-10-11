"""
ApplyReady AI — Requirements Extractor
Extracts structured eligibility criteria from text using pattern matching.
Clearly labelled as rule-based (not ML). Returns structured criteria list.
"""

import re
from typing import Optional


# ─── CGPA PATTERNS ────────────────────────────────────────────────────────────
_CGPA_PATTERNS = [
    # "minimum CGPA of 8.5" / "minimum CGPA: 8.5" / "min. CGPA 8.5" / "min CGPA is 8.0" / "minimum CGPA required is 8.0"
    r"(?:minimum|min\.?)\s+(?:required\s+)?(?:CGPA|GPA)(?:\s+required)?\s*(?:of|:|=|>=|at\s+least|is)?\s*(\d+(?:\.\d+)?)",
    # "8.0 CGPA and above" / "7.5 CGPA" / "8 CGPA or higher" / "8.0+ CGPA" / "8 CGPA"
    r"\b(\d+(?:\.\d+)?)\s*(?:\+|and\s+above|or\s+above|or\s+more|or\s+higher)?\s*(?:CGPA|GPA)\b",
    # "at least 8.0 in CGPA" / "scored at least 8.0 CGPA" / "having minimum 7.5 CGPA"
    r"(?:at\s+least|minimum|min\.?|scored|having|with)\s*(?:a\s+)?(?:minimum\s+)?(\d+(?:\.\d+)?)\s*(?:in\s+)?(?:CGPA|GPA)\b",
    # "CGPA of 8.5" / "CGPA >= 8.5" / "CGPA: 8.5" / "CGPA > 7.5" / "CGPA 8.0+" / "CGPA 8.5"
    r"\b(?:CGPA|GPA)\s*(?:of|:|=|>=|=>|>|at\s+least|is|above|more\s+than|greater\s+than)?\s*(\d+(?:\.\d+)?)\s*(?:\+|and\s+above|or\s+above|or\s+more|or\s+higher)?",
    # "cutoff CGPA: 8.0" / "cutoff is 8.0 CGPA"
    r"\b(?:cutoff|benchmark|criteria)\s*(?:is|:)?\s*(?:CGPA\s*)?(\d+(?:\.\d+)?)",
    # "CGPA minimum 8.5"
    r"\b(?:CGPA|GPA)\s+minimum\s*(?:of|:)?\s*(\d+(?:\.\d+)?)",
]

# ─── GRADUATION YEAR PATTERNS ─────────────────────────────────────────────────
_GRAD_YEAR_PATTERNS = [
    r"graduating\s+in\s+((?:19|20)\d{2})",
    r"graduation\s+year\s*(?::|=|of)?\s*((?:19|20)\d{2})",
    r"(?:batch|class)\s*(?:of|:)?\s*((?:19|20)\d{2})",
    r"(?:pass(?:ing|ed)?(?:\s+out)?|complet(?:ing|ed))\s+(?:in|by|of)?\s*((?:19|20)\d{2})",
    r"((?:19|20)\d{2})\s*(?:passout|pass-out|batch|graduates)",
    r"expected\s+(?:graduation|completion).*?((?:19|20)\d{2})",
]

# ─── DEGREE PATTERNS ─────────────────────────────────────────────────────────
_DEGREE_PATTERNS = [
    r"\b(B\.?Tech|B\.?Sc\.?|Bachelor(?:'s)?(?:\s+of\s+[A-Za-z]+)?|M\.?Tech|M\.?Sc\.?|Master(?:'s)?(?:\s+of\s+[A-Za-z]+)?|MBA|MCA|BCA|Ph\.?D)\b",
    r"\b(B\.E\.|B\.E|B\.Eng|Bachelor\s+of\s+Engineering)\b",
]

# ─── DOCUMENT REQUIREMENT PATTERNS ───────────────────────────────────────────
_DOCUMENT_PATTERNS = [
    r"\b(resume|CV|curriculum\s+vitae)\b",
    r"\b(marksheet|mark\s+sheet|transcript|grade\s+sheet)\b",
    r"\b(certificate(?:s)?|recommendation\s+letter(?:s)?)\b",
    r"\b(identity\s+proof|ID\s+proof|Aadhaar|passport|voter\s+ID)\b",
    r"\b(income\s+certificate|income\s+proof|salary\s+slip)\b",
    r"\b(offer\s+letter|appointment\s+letter)\b",
]

# ─── YEAR OF STUDY PATTERNS ───────────────────────────────────────────────────
_STUDY_YEAR_PATTERNS = [
    r"(?:second|third|final|pre-final)\s+year\s+students?",
    r"(\d(?:st|nd|rd|th))\s+year\s+students?",
    r"year\s+(\d)\s+(?:student|undergraduate)",
]


def _extract_evidence_window(text: str, match_start: int, match_end: int, window: int = 80) -> str:
    start = max(0, match_start - window)
    end = min(len(text), match_end + window)
    return text[start:end].strip()


def extract_requirements(text: str) -> dict:
    if not isinstance(text, str) or not text.strip():
        return {
            "minimum_cgpa": None,
            "evidence": None,
            "status": "needs_review",
            "message": "No requirement text was provided.",
            "criteria": [],
        }

    criteria = []

    # ── CGPA ─────────────────────────────────────────────────────────────────
    cgpa_found = None
    cgpa_evidence = None

    for pattern in _CGPA_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                value = float(match.group(1))
            except (IndexError, ValueError):
                continue
            if 0.0 <= value <= 10.0:
                cgpa_found = value
                cgpa_evidence = _extract_evidence_window(text, match.start(), match.end())
                criteria.append({
                    "type": "minimum_cgpa",
                    "value": value,
                    "evidence": cgpa_evidence,
                    "source": "pattern_match",
                    "status": "extracted",
                })
                break

    # ── GRADUATION YEAR ───────────────────────────────────────────────────────
    for pattern in _GRAD_YEAR_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                year = int(match.group(1))
                if 2000 <= year <= 2040:
                    criteria.append({
                        "type": "graduation_year",
                        "value": year,
                        "evidence": _extract_evidence_window(text, match.start(), match.end()),
                        "source": "pattern_match",
                        "status": "extracted",
                    })
                    break
            except (IndexError, ValueError):
                continue

    # ── DEGREE REQUIREMENTS ───────────────────────────────────────────────────
    for pattern in _DEGREE_PATTERNS:
        matches = list(re.finditer(pattern, text, re.IGNORECASE))
        for match in matches[:3]:  # up to 3 degree mentions
            deg = match.group(0).strip()
            # Safety: avoid matching the lowercase English verb "be"
            if deg.lower() == "be" and match.group(0) == "be":
                continue
            # Avoid duplicate degrees
            if any(c.get("type") == "required_degree" and c.get("value", "").lower() == deg.lower() for c in criteria):
                continue
            criteria.append({
                "type": "required_degree",
                "value": deg,
                "evidence": _extract_evidence_window(text, match.start(), match.end()),
                "source": "pattern_match",
                "status": "extracted",
            })

    # ── REQUIRED DOCUMENTS ────────────────────────────────────────────────────
    seen_docs = set()
    for pattern in _DOCUMENT_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            doc_name = match.group(0).strip().lower()
            if doc_name not in seen_docs:
                seen_docs.add(doc_name)
                criteria.append({
                    "type": "required_document",
                    "value": match.group(0).strip(),
                    "evidence": _extract_evidence_window(text, match.start(), match.end()),
                    "source": "pattern_match",
                    "status": "extracted",
                })

    # ── YEAR OF STUDY ─────────────────────────────────────────────────────────
    for pattern in _STUDY_YEAR_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            criteria.append({
                "type": "year_of_study",
                "value": match.group(0).strip(),
                "evidence": _extract_evidence_window(text, match.start(), match.end()),
                "source": "pattern_match",
                "status": "extracted",
            })
            break

    # ── BUILD RETURN ─────────────────────────────────────────────────────────
    if cgpa_found is not None:
        return {
            "minimum_cgpa": cgpa_found,
            "evidence": cgpa_evidence,
            "status": "extracted",
            "message": "Minimum CGPA extracted from requirement text.",
            "criteria": criteria,
        }

    if criteria:
        return {
            "minimum_cgpa": None,
            "evidence": None,
            "status": "partial",
            "message": f"Extracted {len(criteria)} requirement(s). No CGPA threshold found.",
            "criteria": criteria,
        }

    return {
        "minimum_cgpa": None,
        "evidence": None,
        "status": "needs_review",
        "message": "No supported requirements were found. Review the text manually.",
        "criteria": [],
    }
