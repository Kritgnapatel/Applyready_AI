"""
ApplyReady AI - Document Extraction & Evidence Verification Module
Robust, rule-based extraction supporting varied layouts, tables, and document structures.
"""

from typing import Dict, Any, List, Optional, Tuple
import re
import pymupdf


MAX_FILE_SIZE = 5 * 1024 * 1024


def clean_evidence_text(text: str) -> str:
    """Normalize whitespace and newlines for clean evidence display."""
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " | ".join(lines)


def parse_page_tables(page) -> List[List[List[Optional[str]]]]:
    """Extract structured tables using PyMuPDF table finder."""
    extracted_tables = []
    try:
        tables = page.find_tables()
        for tab in tables:
            data = tab.extract()
            if data and len(data) > 1:
                extracted_tables.append(data)
    except Exception:
        pass
    return extracted_tables


def extract_from_tables(tables: List[List[List[Optional[str]]]], page_num: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Extract CGPA, SGPA, academic_year, and dates from tabular layouts."""
    fields: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }
    evidence: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }

    decimal_pattern = re.compile(r"\b(10(?:\.0{1,2})?|[0-9]\.\d{1,2})\b")
    acad_year_pattern = re.compile(r"\b((?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)?\d{2}))\b")

    for tab in tables:
        for r_idx, row in enumerate(tab):
            for c_idx, cell in enumerate(row):
                if not cell:
                    continue
                cell_clean = cell.strip()
                cell_upper = cell_clean.upper()

                # 1. CGPA in table
                if fields["cgpa"] is None and re.search(r"\b(?:CGPA|C\.G\.P\.A\.)\b", cell_upper):
                    for val_r in range(r_idx + 1, len(tab)):
                        val_str = tab[val_r][c_idx] if c_idx < len(tab[val_r]) else None
                        if val_str:
                            m = decimal_pattern.search(val_str)
                            if m:
                                val = float(m.group(1))
                                if 0.0 <= val <= 10.0:
                                    fields["cgpa"] = val
                                    evidence["cgpa"] = {
                                        "page": page_num,
                                        "text": f"Table header: '{cell_clean}' -> Cell: '{val_str.strip()}'",
                                        "matched_text": m.group(0),
                                    }
                                    break

                # 2. SGPA in table
                if fields["sgpa"] is None and re.search(r"\b(?:SGPA|S\.G\.P\.A\.)\b", cell_upper):
                    for val_r in range(r_idx + 1, len(tab)):
                        val_str = tab[val_r][c_idx] if c_idx < len(tab[val_r]) else None
                        if val_str:
                            m = decimal_pattern.search(val_str)
                            if m:
                                val = float(m.group(1))
                                if 0.0 <= val <= 10.0:
                                    fields["sgpa"] = val
                                    evidence["sgpa"] = {
                                        "page": page_num,
                                        "text": f"Table header: '{cell_clean}' -> Cell: '{val_str.strip()}'",
                                        "matched_text": m.group(0),
                                    }
                                    break

                # 3. Academic Year in table
                if fields["academic_year"] is None and "ACADEMIC YEAR" in cell_upper:
                    for val_r in range(r_idx + 1, len(tab)):
                        val_str = tab[val_r][c_idx] if c_idx < len(tab[val_r]) else None
                        if val_str:
                            m = acad_year_pattern.search(val_str)
                            if m:
                                norm_val = re.sub(r"\s+", "", m.group(1))
                                fields["academic_year"] = norm_val
                                evidence["academic_year"] = {
                                    "page": page_num,
                                    "text": f"Table header: '{cell_clean}' -> Cell: '{val_str.strip()}'",
                                    "matched_text": m.group(0),
                                }
                                break

    return fields, evidence


def extract_from_blocks(blocks: List[Any], page_num: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Extract fields from text blocks using robust contextual regex patterns."""
    fields: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }
    evidence: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }

    # Strict regex patterns designed to avoid cross-field confusion
    cgpa_labeled = re.compile(
        r"\b(?:CGPA|C\.G\.P\.A\.|Cumulative\s+GPA)\b\s*[:=-]?\s*([0-9]\.\d{1,2}|10(?:\.0{1,2})?)\b",
        re.IGNORECASE,
    )
    sgpa_labeled = re.compile(
        r"\b(?:SGPA|S\.G\.P\.A\.|Semester\s+GPA)\b\s*[:=-]?\s*([0-9]\.\d{1,2}|10(?:\.0{1,2})?)\b",
        re.IGNORECASE,
    )
    gpa_generic = re.compile(
        r"\bGPA\b\s*[:=-]?\s*([0-9]\.\d{1,2}|10(?:\.0{1,2})?)\b",
        re.IGNORECASE,
    )

    admission_year_pat = re.compile(
        r"\b(?:YEAR\s+OF\s+ADMISSION|ADMISSION\s+YEAR|ENROLLMENT\s+YEAR|JOINING\s+YEAR|ADMITTED\s+IN)\b"
        r"\s*[:=-]?\s*((?:19|20)\d{2})\b",
        re.IGNORECASE,
    )

    grad_year_labeled = re.compile(
        r"\b(?:GRADUATION\s+YEAR|YEAR\s+OF\s+GRADUATION|EXPECTED\s+GRADUATION|PASSING\s+YEAR|"
        r"COMPLETION\s+YEAR|YEAR\s+OF\s+PASSING)\b"
        r"\s*[:=-]?\s*((?:19|20)\d{2})\b",
        re.IGNORECASE,
    )

    batch_of_year = re.compile(
        r"\b(?:BATCH\s+OF|CLASS\s+OF)\s+((?:19|20)\d{2})\b",
        re.IGNORECASE,
    )

    batch_short = re.compile(
        r"\bBATCH\s*[-:]\s*(\d{2})\b",
        re.IGNORECASE,
    )

    acad_year_pat = re.compile(
        r"\b(?:ACADEMIC\s+YEAR|ACADEMIC\s+SESSION)\b\s*[:=-]?\s*"
        r"((?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)?\d{2}))\b",
        re.IGNORECASE,
    )

    # Secondary check: Degree education date range (e.g. "2024 - 2028", "2024 - Present")
    degree_date_range = re.compile(
        r"\b((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2}|Present|Current|Ongoing)\b",
        re.IGNORECASE,
    )

    degree_pat = re.compile(
        r"\b(B\.?Tech(?:\s*[-–]\s*[A-Za-z\s]+)?|Bachelor\s+of\s+Technology(?:\s*[-–]\s*[A-Za-z\s]+)?|B\.?E\.?(?:\s*[-–]\s*[A-Za-z\s]+)?|Bachelor\s+of\s+Engineering|B\.?Sc\.?|M\.?Tech|M\.?Sc\.?|MBA|MCA)\b",
        re.IGNORECASE,
    )

    study_year_pat = re.compile(
        r"\b((?:First|Second|Third|Fourth|Final)\s+Year(?:\s+Undergraduate)?|[1-4](?:st|nd|rd|th)\s+Year)\b",
        re.IGNORECASE,
    )

    for b in blocks:
        # PyMuPDF block format: (x0, y0, x1, y1, text, block_no, block_type)
        if len(b) < 5 or b[1] is None:
            continue
        b_text = b[4]
        if not b_text.strip():
            continue

        clean_text = clean_evidence_text(b_text)

        # 1. CGPA
        if fields["cgpa"] is None:
            m = cgpa_labeled.search(b_text)
            if m:
                val = float(m.group(1))
                if 0.0 <= val <= 10.0:
                    fields["cgpa"] = val
                    evidence["cgpa"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m.group(0),
                    }

        # 2. SGPA
        if fields["sgpa"] is None:
            m = sgpa_labeled.search(b_text)
            if m:
                val = float(m.group(1))
                if 0.0 <= val <= 10.0:
                    fields["sgpa"] = val
                    evidence["sgpa"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m.group(0),
                    }

        # 3. Generic GPA fallback (only if CGPA and SGPA are not yet found)
        if fields["cgpa"] is None and fields["sgpa"] is None:
            m = gpa_generic.search(b_text)
            if m:
                val = float(m.group(1))
                if 0.0 <= val <= 10.0:
                    fields["cgpa"] = val
                    evidence["cgpa"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m.group(0),
                    }

        # 4. Admission Year
        if fields["admission_year"] is None:
            m = admission_year_pat.search(b_text)
            if m:
                fields["admission_year"] = int(m.group(1))
                evidence["admission_year"] = {
                    "page": page_num,
                    "text": clean_text,
                    "matched_text": m.group(0),
                }

        # 5. Graduation Year
        if fields["graduation_year"] is None:
            m = grad_year_labeled.search(b_text)
            if m:
                fields["graduation_year"] = int(m.group(1))
                evidence["graduation_year"] = {
                    "page": page_num,
                    "text": clean_text,
                    "matched_text": m.group(0),
                }
            else:
                m_batch = batch_of_year.search(b_text)
                if m_batch:
                    fields["graduation_year"] = int(m_batch.group(1))
                    evidence["graduation_year"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m_batch.group(0),
                    }
                else:
                    m_short = batch_short.search(b_text)
                    if m_short:
                        fields["graduation_year"] = 2000 + int(m_short.group(1))
                        evidence["graduation_year"] = {
                            "page": page_num,
                            "text": clean_text,
                            "matched_text": m_short.group(0),
                        }

        # 6. Academic Year
        if fields["academic_year"] is None:
            m = acad_year_pat.search(b_text)
            if m:
                norm_val = re.sub(r"\s+", "", m.group(1))
                fields["academic_year"] = norm_val
                evidence["academic_year"] = {
                    "page": page_num,
                    "text": clean_text,
                    "matched_text": m.group(0),
                }

        # Contextual Education range fallback:
        # e.g., "Third Year | 2024 - Present" or "B.Tech | 2020 - 2024"
        is_edu_context = (
            any(
                k in b_text.lower()
                for k in ["education", "b.tech", "undergraduate", "bachelor", "degree", "institute", "university", "college", "school", "year"]
            )
            or fields["degree"] is not None
            or fields["year_of_study"] is not None
        )
        if is_edu_context:
            m_range = degree_date_range.search(b_text)
            if m_range:
                start_yr = int(m_range.group(1))
                end_str = m_range.group(2).lower()
                if fields["admission_year"] is None:
                    fields["admission_year"] = start_yr
                    evidence["admission_year"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m_range.group(0),
                    }
                if fields["graduation_year"] is None:
                    if end_str not in ["present", "current", "ongoing"]:
                        try:
                            fields["graduation_year"] = int(end_str)
                            evidence["graduation_year"] = {
                                "page": page_num,
                                "text": clean_text,
                                "matched_text": m_range.group(0),
                            }
                        except ValueError:
                            pass
                    elif (
                        any(k in b_text.lower() for k in ["b.tech", "b.e", "bachelor", "undergraduate"])
                        or (fields["degree"] and any(k in str(fields["degree"]).lower() for k in ["b.tech", "b.e", "bachelor"]))
                    ):
                        fields["graduation_year"] = start_yr + 4
                        evidence["graduation_year"] = {
                            "page": page_num,
                            "text": clean_text,
                            "matched_text": f"Expected {start_yr + 4} (Inferred from 4-year degree starting {start_yr})",
                        }

            # Degree
            if fields["degree"] is None:
                m_deg = degree_pat.search(b_text)
                if m_deg:
                    fields["degree"] = m_deg.group(1).strip()
                    evidence["degree"] = {
                        "page": page_num,
                        "text": clean_text,
                        "matched_text": m_deg.group(0),
                    }

        # Year of study
        if fields["year_of_study"] is None:
            m_yr = study_year_pat.search(b_text)
            if m_yr:
                fields["year_of_study"] = m_yr.group(1).strip()
                evidence["year_of_study"] = {
                    "page": page_num,
                    "text": clean_text,
                    "matched_text": m_yr.group(0),
                }

    return fields, evidence


def extract_document_data(doc: pymupdf.Document) -> Tuple[Dict[str, Any], Dict[str, Any], bool]:
    """
    Extracts all supported academic fields across all pages of a PyMuPDF document.
    Returns: (fields, evidence, is_scanned_or_empty)
    """
    aggregated_fields: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }
    aggregated_evidence: Dict[str, Any] = {
        "cgpa": None,
        "sgpa": None,
        "graduation_year": None,
        "admission_year": None,
        "academic_year": None,
        "degree": None,
        "year_of_study": None,
    }

    total_text_length = 0

    for page_idx, page in enumerate(doc, start=1):
        page_text = page.get_text()
        total_text_length += len(page_text.strip())

        # 1. First attempt structured table extraction
        tables = parse_page_tables(page)
        tab_fields, tab_evidence = extract_from_tables(tables, page_idx)

        # Merge table results
        for k, v in tab_fields.items():
            if aggregated_fields[k] is None and v is not None:
                aggregated_fields[k] = v
                aggregated_evidence[k] = tab_evidence[k]

        # 2. Second attempt block / line-based extraction
        blocks = page.get_text("blocks")
        blk_fields, blk_evidence = extract_from_blocks(blocks, page_idx)

        # Merge block results
        for k, v in blk_fields.items():
            if aggregated_fields[k] is None and v is not None:
                aggregated_fields[k] = v
                aggregated_evidence[k] = blk_evidence[k]

    is_scanned = (total_text_length < 30 and doc.page_count > 0)
    return aggregated_fields, aggregated_evidence, is_scanned
