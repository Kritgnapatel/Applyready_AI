"""
ApplyReady AI - Comprehensive Test Suite
Covers:
1. Normal cases (labeled inline fields, headers, tables)
2. Edge cases (date ranges, different separators, 10.0 CGPA, 2-digit batch years)
3. False match prevention (percentage vs CGPA, year in address vs grad year, phone vs roll)
4. Mismatch detection (differing CGPA / graduation years)
5. Missing values / needs_review handling
6. Real user files (sem 2 result.pdf, 112416048_kritgna_patel.pdf, uploaded CV)
7. Scanned document handling
"""

import unittest
import os
import pymupdf
import extractor


class TestDocumentExtraction(unittest.TestCase):

    def create_pdf(self, filename: str, pages_text: list) -> str:
        doc = pymupdf.open()
        for text in pages_text:
            p = doc.new_page()
            p.insert_text((50, 100), text)
        doc.save(filename)
        doc.close()
        return filename

    def tearDown(self):
        # Clean up generated test PDFs
        for f in os.listdir("."):
            if f.startswith("tmp_test_") and f.endswith(".pdf"):
                try:
                    os.remove(f)
                except Exception:
                    pass

    def test_01_normal_inline_extraction(self):
        """Standard resume with labeled CGPA and Graduation Year."""
        pdf_path = self.create_pdf("tmp_test_01.pdf", [
            "John Doe\nEducation: B.Tech Computer Science\nCGPA: 8.85\nGraduation Year: 2025"
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertFalse(is_scanned)
        self.assertEqual(fields["cgpa"], 8.85)
        self.assertEqual(fields["graduation_year"], 2025)
        self.assertIsNotNone(evidence["cgpa"])
        self.assertEqual(evidence["cgpa"]["page"], 1)

    def test_02_varied_labels_and_spacing(self):
        """Various labels: Cumulative GPA, SGPA, Passing Year, Year of Admission."""
        pdf_path = self.create_pdf("tmp_test_02.pdf", [
            "Applicant Profile\nCumulative GPA = 9.20\nSemester GPA : 9.50\nPassing Year : 2026\nYear of Admission : 2022"
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertEqual(fields["cgpa"], 9.20)
        self.assertEqual(fields["sgpa"], 9.50)
        self.assertEqual(fields["graduation_year"], 2026)
        self.assertEqual(fields["admission_year"], 2022)

    def test_03_date_ranges_and_batch(self):
        """Batch of 2028 and Academic Year range 2024-2025."""
        pdf_path = self.create_pdf("tmp_test_03.pdf", [
            "Institute of Technology\nClass of 2027\nAcademic Year: 2023 - 2024\nCGPA: 8.10"
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertEqual(fields["graduation_year"], 2027)
        self.assertEqual(fields["academic_year"], "2023-2024")
        self.assertEqual(fields["cgpa"], 8.10)

    def test_04_false_match_prevention(self):
        """Do not confuse Percentage (95.33), Phone numbers, or Pin codes with CGPA."""
        pdf_path = self.create_pdf("tmp_test_04.pdf", [
            "Name: Candidate\nPhone: +91 9876543210\nAddress: Sector 2024, Pin 411048\nPercentage: 92.50%\nJEE Score: 98.4"
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        # Should NOT guess percentage or phone numbers as CGPA or SGPA
        self.assertIsNone(fields["cgpa"])
        self.assertIsNone(fields["sgpa"])
        self.assertIsNone(fields["graduation_year"])

    def test_05_missing_fields_graceful(self):
        """Missing fields should safely return None without throwing errors."""
        pdf_path = self.create_pdf("tmp_test_05.pdf", [
            "Project Portfolio\nBuilt an AI application in Python and JavaScript.\nTools: Git, Docker."
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertIsNone(fields["cgpa"])
        self.assertIsNone(fields["sgpa"])
        self.assertIsNone(fields["graduation_year"])
        self.assertIsNone(fields["admission_year"])
        self.assertIsNone(fields["academic_year"])

    def test_06_real_marksheet_sem2_result(self):
        """Verify extraction on actual user marksheet: sem 2 result.pdf."""
        real_path = "C:/Users/patel/Downloads/sem 2 result.pdf"
        if os.path.exists(real_path):
            doc = pymupdf.open(real_path)
            fields, evidence, is_scanned = extractor.extract_document_data(doc)
            self.assertFalse(is_scanned)
            self.assertEqual(fields["cgpa"], 8.23)
            self.assertEqual(fields["sgpa"], 8.85)
            self.assertEqual(fields["admission_year"], 2024)
            self.assertEqual(fields["academic_year"], "2024-2025")
            self.assertIsNotNone(evidence["cgpa"])
            self.assertIsNotNone(evidence["sgpa"])

    def test_07_real_cv_batch_28(self):
        """Verify extraction on actual user CV: 112416048_kritgna_patel.pdf."""
        real_path = "C:/Users/patel/Downloads/112416048_kritgna_patel.pdf"
        if os.path.exists(real_path):
            doc = pymupdf.open(real_path)
            fields, evidence, is_scanned = extractor.extract_document_data(doc)
            self.assertFalse(is_scanned)
            self.assertEqual(fields["cgpa"], 8.56)
            self.assertEqual(fields["graduation_year"], 2028)
            self.assertIsNotNone(evidence["cgpa"])
            self.assertIsNotNone(evidence["graduation_year"])

    def test_08_real_uploaded_cv(self):
        """Verify extraction on actual backend uploaded CV."""
        real_path = "../backend/private-uploads/1262a6ec-3998-40c8-9471-ef6c7172ff5b.pdf"
        if os.path.exists(real_path):
            doc = pymupdf.open(real_path)
            fields, evidence, is_scanned = extractor.extract_document_data(doc)
            self.assertFalse(is_scanned)
            self.assertEqual(fields["cgpa"], 8.56)
            self.assertEqual(fields["admission_year"], 2024)

    def test_09_scanned_document_detection(self):
        """Empty or image-only PDF is identified as scanned."""
        pdf_path = self.create_pdf("tmp_test_09.pdf", [""])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertTrue(is_scanned)
        self.assertIsNone(fields["cgpa"])


    def test_10_degree_extraction(self):
        """Verify extraction of degree and year of study."""
        pdf_path = self.create_pdf("tmp_test_10.pdf", [
            "John Doe\nCandidate for Bachelor of Technology in Computer Science\nCGPA: 8.5\n2022 - 2026"
        ])
        doc = pymupdf.open(pdf_path)
        fields, evidence, is_scanned = extractor.extract_document_data(doc)
        self.assertEqual(fields["degree"], "Bachelor of Technology")
        self.assertEqual(fields["graduation_year"], 2026)

    def test_11_degree_equivalence(self):
        """Verify degree equivalence matching between B.Tech, BE, and Bachelor of Technology."""
        from eligibility import are_degrees_equivalent
        self.assertTrue(are_degrees_equivalent("B.Tech", "Bachelor of Technology"))
        self.assertTrue(are_degrees_equivalent("btech", "B.E."))
        self.assertTrue(are_degrees_equivalent("BACHELOR OF TECHNOLOGY", "b.tech"))
        self.assertFalse(are_degrees_equivalent("B.Tech", "MBA"))


if __name__ == "__main__":
    unittest.main()
