"""
ApplyReady AI — Eligibility Engine Unit Tests
Run: .\\venv312\\Scripts\\python.exe -m pytest test_eligibility.py -v
"""

import unittest
from eligibility import (
    check_minimum_cgpa,
    check_graduation_year,
    check_required_documents,
    check_all,
)


class TestCheckMinimumCgpa(unittest.TestCase):

    def test_eligible_meets_exact(self):
        result = check_minimum_cgpa(8.5, 8.5)
        self.assertEqual(result["status"], "eligible")
        self.assertEqual(result["actual_value"], 8.5)

    def test_eligible_exceeds(self):
        result = check_minimum_cgpa(9.2, 8.0)
        self.assertEqual(result["status"], "eligible")

    def test_not_met_below(self):
        result = check_minimum_cgpa(7.5, 8.0)
        self.assertEqual(result["status"], "not_met")
        self.assertEqual(result["actual_value"], 7.5)
        self.assertEqual(result["required_value"], 8.0)

    def test_missing_cgpa(self):
        result = check_minimum_cgpa(None, 8.0)
        self.assertEqual(result["status"], "missing")
        self.assertIsNone(result["actual_value"])

    def test_no_requirement(self):
        result = check_minimum_cgpa(8.5, None)
        self.assertEqual(result["status"], "needs_review")

    def test_invalid_requirement(self):
        result = check_minimum_cgpa(8.5, 11.0)
        self.assertEqual(result["status"], "needs_review")

    def test_boundary_zero(self):
        result = check_minimum_cgpa(0.0, 0.0)
        self.assertEqual(result["status"], "eligible")

    def test_boundary_ten(self):
        result = check_minimum_cgpa(10.0, 10.0)
        self.assertEqual(result["status"], "eligible")

    def test_negative_cgpa_invalid(self):
        result = check_minimum_cgpa(-1.0, 8.0)
        self.assertEqual(result["status"], "needs_review")

    def test_field_results_present(self):
        result = check_minimum_cgpa(8.5, 8.0)
        self.assertIn("field_results", result)
        self.assertIsInstance(result["field_results"], list)
        self.assertGreater(len(result["field_results"]), 0)

    def test_field_result_has_next_step_when_not_met(self):
        result = check_minimum_cgpa(7.0, 8.0)
        fr = result["field_results"][0]
        self.assertEqual(fr["status"], "not_met")
        self.assertIsNotNone(fr["next_step"])
        self.assertEqual(fr["severity"], "high")

    def test_field_result_has_next_step_when_missing(self):
        result = check_minimum_cgpa(None, 8.0)
        fr = result["field_results"][0]
        self.assertEqual(fr["status"], "missing")
        self.assertIsNotNone(fr["next_step"])


class TestCheckGraduationYear(unittest.TestCase):

    def test_match(self):
        result = check_graduation_year(2026, 2026)
        self.assertEqual(result["status"], "eligible")

    def test_mismatch(self):
        result = check_graduation_year(2027, 2026)
        self.assertEqual(result["status"], "not_met")

    def test_missing_extracted(self):
        result = check_graduation_year(None, 2026)
        self.assertEqual(result["status"], "missing")

    def test_no_requirement(self):
        result = check_graduation_year(2026, None)
        self.assertEqual(result["status"], "needs_review")

    def test_both_none(self):
        result = check_graduation_year(None, None)
        self.assertEqual(result["status"], "needs_review")


class TestCheckRequiredDocuments(unittest.TestCase):

    def test_all_present(self):
        results = check_required_documents(
            ["resume", "marksheet"],
            ["resume", "marksheet"],
        )
        statuses = [r["status"] for r in results]
        self.assertIn("eligible", statuses)
        self.assertNotIn("missing", statuses)

    def test_missing_one(self):
        results = check_required_documents(
            ["resume"],
            ["resume", "marksheet"],
        )
        statuses = [r["status"] for r in results]
        self.assertIn("missing", statuses)

    def test_empty_uploaded(self):
        results = check_required_documents([], ["resume", "certificate"])
        statuses = [r["status"] for r in results]
        self.assertTrue(all(s == "missing" for s in statuses))

    def test_empty_requirements(self):
        results = check_required_documents(["resume", "marksheet"], [])
        self.assertEqual(results, [])


class TestCheckAll(unittest.TestCase):

    def test_all_eligible(self):
        result = check_all(
            extracted_fields={"cgpa": 9.0, "graduation_year": 2026},
            requirement_criteria=[
                {"type": "minimum_cgpa", "value": 8.0, "evidence": "min CGPA 8.0"},
                {"type": "graduation_year", "value": 2026, "evidence": "batch 2026"},
            ],
            uploaded_document_types=["resume"],
        )
        self.assertEqual(result["overall_status"], "eligible")
        self.assertGreater(result["summary"]["eligible"], 0)

    def test_not_met_cgpa(self):
        result = check_all(
            extracted_fields={"cgpa": 7.0},
            requirement_criteria=[
                {"type": "minimum_cgpa", "value": 8.0, "evidence": "min CGPA 8.0"},
            ],
            uploaded_document_types=["resume"],
        )
        self.assertEqual(result["overall_status"], "not_met")

    def test_missing_documents(self):
        result = check_all(
            extracted_fields={},
            requirement_criteria=[
                {"type": "required_document", "value": "marksheet"},
            ],
            uploaded_document_types=[],
        )
        self.assertEqual(result["overall_status"], "missing")

    def test_empty_criteria(self):
        result = check_all(
            extracted_fields={"cgpa": 8.5},
            requirement_criteria=[],
            uploaded_document_types=["resume"],
        )
        self.assertEqual(result["overall_status"], "needs_review")


if __name__ == "__main__":
    unittest.main()
