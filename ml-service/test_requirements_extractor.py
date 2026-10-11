"""
ApplyReady AI — Requirements Extractor Unit Tests
Run: .\\venv312\\Scripts\\python.exe -m pytest test_requirements_extractor.py -v
"""

import unittest
from requirements_extractor import extract_requirements


class TestCgpaExtraction(unittest.TestCase):

    def test_minimum_cgpa_standard(self):
        r = extract_requirements("Minimum CGPA of 8.0 required for all applicants.")
        self.assertEqual(r["status"], "extracted")
        self.assertEqual(r["minimum_cgpa"], 8.0)
        self.assertIsNotNone(r["evidence"])

    def test_minimum_cgpa_colon(self):
        r = extract_requirements("Eligibility: Minimum CGPA: 7.5")
        self.assertEqual(r["minimum_cgpa"], 7.5)

    def test_cgpa_at_least(self):
        r = extract_requirements("CGPA at least 8.5 is mandatory.")
        self.assertEqual(r["minimum_cgpa"], 8.5)

    def test_cgpa_ge_operator(self):
        r = extract_requirements("Students with CGPA >= 9.0 are eligible.")
        self.assertEqual(r["minimum_cgpa"], 9.0)

    def test_cgpa_10_boundary(self):
        r = extract_requirements("Minimum CGPA of 10.0 required.")
        self.assertEqual(r["minimum_cgpa"], 10.0)

    def test_cgpa_zero(self):
        # 0.0 is technically valid but unusual
        r = extract_requirements("Minimum CGPA of 0.0 required.")
        # Should extract but might be unusual — accept it
        self.assertIn(r["minimum_cgpa"], [0.0, None])

    def test_cgpa_above_10_rejected(self):
        r = extract_requirements("Minimum CGPA of 11.0 required.")
        # 11.0 is out of range — should not extract as cgpa
        self.assertIsNone(r["minimum_cgpa"])

    def test_no_cgpa_in_text(self):
        r = extract_requirements("Students must submit a cover letter and two references.")
        self.assertIsNone(r["minimum_cgpa"])

    def test_empty_text(self):
        r = extract_requirements("")
        self.assertEqual(r["status"], "needs_review")
        self.assertIsNone(r["minimum_cgpa"])

    def test_none_input(self):
        r = extract_requirements(None)
        self.assertEqual(r["status"], "needs_review")

    def test_criteria_list_present(self):
        r = extract_requirements("Minimum CGPA of 8.0 required.")
        self.assertIn("criteria", r)
        self.assertIsInstance(r["criteria"], list)


class TestGraduationYearExtraction(unittest.TestCase):

    def test_graduating_in_year(self):
        r = extract_requirements("Students graduating in 2026 are eligible.")
        years = [c["value"] for c in r.get("criteria", []) if c["type"] == "graduation_year"]
        self.assertIn(2026, years)

    def test_batch_of(self):
        r = extract_requirements("Only Batch of 2025 students need apply.")
        years = [c["value"] for c in r.get("criteria", []) if c["type"] == "graduation_year"]
        self.assertIn(2025, years)

    def test_class_of(self):
        r = extract_requirements("Open to Class of 2027 students.")
        years = [c["value"] for c in r.get("criteria", []) if c["type"] == "graduation_year"]
        self.assertIn(2027, years)


class TestDegreeExtraction(unittest.TestCase):

    def test_btech_degree(self):
        r = extract_requirements("Open to B.Tech students in Computer Science.")
        types = [c["type"] for c in r.get("criteria", [])]
        self.assertIn("required_degree", types)

    def test_mtech_degree(self):
        r = extract_requirements("M.Tech students may apply.")
        types = [c["type"] for c in r.get("criteria", [])]
        self.assertIn("required_degree", types)


class TestDocumentRequirements(unittest.TestCase):

    def test_resume_required(self):
        r = extract_requirements("Please submit your resume and a marksheet.")
        doc_types = [c["type"] for c in r.get("criteria", [])]
        self.assertIn("required_document", doc_types)

    def test_certificate_required(self):
        r = extract_requirements("Submit certificates of achievements along with your application.")
        doc_values = [c["value"].lower() for c in r.get("criteria", []) if c["type"] == "required_document"]
        self.assertTrue(any("certificate" in v for v in doc_values))


class TestPartialExtraction(unittest.TestCase):

    def test_partial_status_when_no_cgpa(self):
        r = extract_requirements("B.Tech students graduating in 2026 should apply.")
        # Has criteria but no CGPA
        self.assertIsNone(r["minimum_cgpa"])
        self.assertTrue(len(r["criteria"]) > 0 or r["status"] == "needs_review")

    def test_full_text_multiple_criteria(self):
        text = (
            "Eligibility: B.Tech / M.Tech students with minimum CGPA of 8.5. "
            "Batch of 2026 only. Submit resume and marksheet."
        )
        r = extract_requirements(text)
        self.assertEqual(r["minimum_cgpa"], 8.5)
        self.assertEqual(r["status"], "extracted")
        criteria_types = [c["type"] for c in r["criteria"]]
        self.assertIn("minimum_cgpa", criteria_types)
        self.assertIn("required_document", criteria_types)


if __name__ == "__main__":
    unittest.main()
