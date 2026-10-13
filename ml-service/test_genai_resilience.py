"""
ApplyReady AI — Grounded GenAI Resilience Tests
Tests model fallback, upstream HTTP 503 handling, credential errors, and graceful degradation.
"""

import unittest
from unittest.mock import patch, MagicMock
import urllib.error
import io
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import genai_client


class TestGenAIResilience(unittest.TestCase):

    def test_missing_api_key_returns_graceful_response(self):
        """When GEMINI_API_KEY is not set, must return available=False with HTTP 200 equivalent."""
        with patch.object(genai_client, "_load_env_key", return_value=""):
            res = genai_client.explain_verification_results(
                opportunity_name="Google SWE Intern",
                domain="internship",
            )
            self.assertFalse(res["available"])
            self.assertIsNone(res["text"])
            self.assertEqual(res["method"], "no_api_key")
            self.assertIn("not set", res["note"])

    @patch("urllib.request.urlopen")
    def test_upstream_503_overloaded_handled_gracefully(self, mock_urlopen):
        """When Gemini returns HTTP 503 (overloaded), client must handle gracefully without crashing."""
        mock_err = urllib.error.HTTPError(
            url="https://generativelanguage.googleapis.com",
            code=503,
            msg="Service Unavailable",
            hdrs={},
            fp=io.BytesIO(b'{"error": {"code": 503, "message": "The model is overloaded."}}')
        )
        mock_urlopen.side_effect = mock_err

        with patch.object(genai_client, "_load_env_key", return_value="dummy_key_12345"):
            res = genai_client.explain_verification_results(
                opportunity_name="Google SWE Intern",
                domain="internship",
            )
            self.assertFalse(res["available"])
            self.assertIsNone(res["text"])
            self.assertIn("503", res["note"])
            self.assertIn("preserved", res["note"])

    @patch("urllib.request.urlopen")
    def test_invalid_api_credentials_returns_auth_error(self, mock_urlopen):
        """When Gemini returns HTTP 400/401/403 (invalid key), stops immediately with auth_error."""
        mock_err = urllib.error.HTTPError(
            url="https://generativelanguage.googleapis.com",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=io.BytesIO(b'{"error": {"code": 400, "message": "API key not valid."}}')
        )
        mock_urlopen.side_effect = mock_err

        with patch.object(genai_client, "_load_env_key", return_value="invalid_key"):
            res = genai_client.explain_verification_results(
                opportunity_name="Google SWE Intern",
                domain="internship",
            )
            self.assertFalse(res["available"])
            self.assertIsNone(res["text"])
            self.assertEqual(res["method"], "auth_error")
            self.assertIn("Check your GEMINI_API_KEY", res["note"])

    @patch("urllib.request.urlopen")
    def test_timeout_handled_gracefully(self, mock_urlopen):
        """When Gemini API times out, returns timeout method without raising exception."""
        mock_urlopen.side_effect = TimeoutError("Timed out")

        with patch.object(genai_client, "_load_env_key", return_value="dummy_key_12345"):
            res = genai_client.explain_verification_results(
                opportunity_name="Google SWE Intern",
                domain="internship",
            )
            self.assertFalse(res["available"])
            self.assertIsNone(res["text"])
            self.assertEqual(res["method"], "timeout")

    @patch("urllib.request.urlopen")
    def test_successful_guidance_generation(self, mock_urlopen):
        """When Gemini succeeds, returns available=True with disclaimer attached."""
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"candidates": [{"content": {"parts": [{"text": "Focus on system design and build a solid portfolio project."}]}}]}'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch.object(genai_client, "_load_env_key", return_value="dummy_key_12345"):
            res = genai_client.explain_verification_results(
                opportunity_name="Google SWE Intern",
                domain="internship",
            )
            self.assertTrue(res["available"])
            self.assertIsNotNone(res["text"])
            self.assertIn("automated assessment suggestion", res["text"].lower())
            self.assertEqual(res["method"], "gemini_rest")


if __name__ == "__main__":
    unittest.main()
