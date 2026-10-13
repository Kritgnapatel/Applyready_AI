"""
ApplyReady AI — Grounded GenAI Client (Google Gemini)
Generates student-friendly explanations from verified evidence — not raw document text.

SAFETY RULES ENFORCED:
- Model receives only structured verification results and extracted evidence snippets.
- Raw document text is never sent.
- Model output is labelled as suggestions, not official decisions.
- Falls back gracefully when key is absent or provider is unavailable.
- Timeouts and rate-limit errors are handled.
- Supports direct Google REST API (zero extra dependencies) with optional SDK support.
"""

import os
import json
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any

_MODEL_NAME = "gemini-3.5-flash-lite"
_CANDIDATE_MODELS = ["gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"]

_SYSTEM_INSTRUCTIONS = """
You are an academic application readiness assistant. Your job is to help students understand
the results of their document verification and improve their applications.

Rules you MUST follow:
1. NEVER invent eligibility rules, facts, or document data.
2. NEVER override the deterministic verification results shown to you.
3. NEVER guarantee scholarship or internship selection.
4. NEVER treat missing information as proof of ineligibility.
5. Use ONLY the structured evidence provided — do not speculate beyond it.
6. Keep your language clear, empathetic, and student-friendly.
7. Mark everything as suggestions, not official decisions.
8. Do not mention any other student's information.
""".strip()


def _load_env_key() -> str:
    """Dynamically resolve GEMINI_API_KEY from os.environ or .env files."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key

    # Check candidate .env paths
    curr_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(curr_dir, ".env"),
        os.path.join(curr_dir, "..", ".env"),
        os.path.join(curr_dir, "..", "backend", ".env"),
    ]
    for env_path in candidates:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val:
                                return val
            except Exception:
                pass
    return ""


def _build_prompt(
    opportunity_name: str,
    domain: str,
    eligibility_result: Optional[dict] = None,
    field_results: Optional[list] = None,
    comparison_result: Optional[dict] = None,
    requirements_text: Optional[str] = None,
    internship_analysis: Optional[dict] = None,
    proof_of_skill: Optional[dict] = None,
    document_integrity: Optional[dict] = None,
) -> str:
    prompt_parts = [
        f"The student is applying for: {opportunity_name} ({domain})",
        "",
    ]

    if domain == "internship" and internship_analysis:
        prompt_parts.extend([
            "## Internship Intelligence Results (deterministic analysis):",
            f"Technical Alignment Index: {internship_analysis.get('alignment_index')}% ({internship_analysis.get('alignment_label')})",
            f"Required Skills Coverage: {internship_analysis.get('dimensions', {}).get('required_skills_coverage', {}).get('percentage')}%",
            f"Preferred Skills Coverage: {internship_analysis.get('dimensions', {}).get('preferred_skills_coverage', {}).get('percentage')}%",
            f"Experience Evidence Score: {internship_analysis.get('dimensions', {}).get('experience_evidence_score', {}).get('percentage')}%",
            f"Missing Required Skills: {', '.join(internship_analysis.get('missing_required_skills', [])) or 'None'}",
            f"Missing Preferred Skills: {', '.join(internship_analysis.get('missing_preferred_skills', [])) or 'None'}",
            "",
        ])

        is_pos_run = (
            proof_of_skill
            and proof_of_skill.get("status") not in ("not_run", "unable_to_verify", None)
            and bool(proof_of_skill.get("repository"))
        )

        if is_pos_run:
            prompt_parts.extend([
                "## Proof of Skill (GitHub Repository Inspection):",
                f"Repository: {proof_of_skill.get('repository')}",
                f"Status: {proof_of_skill.get('status')}",
                f"Languages: {', '.join(proof_of_skill.get('detected_languages', []))}",
                f"Verified Skills from Manifests: {proof_of_skill.get('verified_count')}/{proof_of_skill.get('total_claimed')}",
                "",
            ])
            pos_task_instruction = (
                "3. Proof-of-Skill was run: refer only to the verified technologies "
                f"({', '.join(proof_of_skill.get('detected_languages', [])) or 'manifests'}) and recommend highlighting this public repository."
            )
        else:
            prompt_parts.extend([
                "## Proof of Skill (GitHub Repository Inspection):",
                "Status: NOT RUN (No public repository URL was provided).",
                "CRITICAL INSTRUCTION: Repository verification was NOT RUN. Never claim that candidate code or repository was inspected, analyzed, or verified.",
                "",
            ])
            pos_task_instruction = (
                "3. Repository verification was NOT RUN: advise the candidate that adding a public GitHub repository link enables automated Proof-of-Skill verification, but state clearly that repository inspection has NOT been run yet."
            )

        if document_integrity:
            prompt_parts.extend([
                "## Document Integrity Findings (Formatting & ATS Observations):",
                f"Status: {document_integrity.get('status_label', 'Clean')}",
                f"Formatting / ATS Signals: {len(document_integrity.get('anomalies', []))}",
                "",
            ])

        prompt_parts.extend([
            "## Your Task for Internship Candidate:",
            "1. Highlight 2-3 specific ways to improve alignment for this role.",
            "2. Offer truthful guidance on how to address missing technical skills without fabricating experience.",
            pos_task_instruction,
            "4. End with: 'This is an automated assessment suggestion, not an official decision.'",
            "",
            "Keep your response under 300 words. Be actionable, specific, and grounded.",
        ])
        return "\n".join(prompt_parts)

    # Scholarship verification prompt
    eligibility_result = eligibility_result or {}
    prompt_parts.extend([
        "## Verification Results (deterministic, do not override):",
        f"Overall eligibility status: {eligibility_result.get('status', 'needs_review')}",
        f"Reason: {eligibility_result.get('reason', 'No reason provided')}",
        "",
    ])

    if field_results:
        prompt_parts.append("## Field-level Results:")
        for r in field_results:
            line = f"- {r.get('field', 'field')}: {r.get('status')} — {r.get('reason', '')}"
            if r.get("actual_value") is not None:
                line += f" (actual: {r.get('actual_value')}, required: {r.get('required_value')})"
            prompt_parts.append(line)
        prompt_parts.append("")

    if comparison_result and comparison_result.get("overall_status") != "needs_review":
        prompt_parts.append(f"## Document Comparison: {comparison_result.get('overall_status')}")
        comparisons = comparison_result.get("comparisons", {})
        if isinstance(comparisons, dict):
            for field_name, comp in comparisons.items():
                if comp.get("status") != "needs_review":
                    prompt_parts.append(
                        f"- {field_name}: {comp.get('status')} — {comp.get('message', '')}"
                    )
        prompt_parts.append("")

    if document_integrity:
        prompt_parts.extend([
            f"## Document Integrity: {document_integrity.get('status_label', 'No Obvious Anomalies')}",
            "",
        ])

    prompt_parts.extend([
        "## Your Task:",
        "1. In 2-3 sentences, summarize the most important issues the student should address.",
        "2. For each 'not_met' or 'missing' result, suggest a specific, actionable correction.",
        "3. If the student is eligible, give a brief encouraging note and any remaining checks.",
        "4. End with: 'This is an automated assessment suggestion, not an official decision.'",
        "",
        "Keep your response under 300 words. Be specific and supportive.",
    ])

    return "\n".join(prompt_parts)


def explain_verification_results(
    opportunity_name: str,
    domain: str,
    eligibility_result: Optional[dict] = None,
    field_results: Optional[list] = None,
    comparison_result: Optional[dict] = None,
    requirements_text: Optional[str] = None,
    internship_analysis: Optional[dict] = None,
    proof_of_skill: Optional[dict] = None,
    document_integrity: Optional[dict] = None,
) -> dict:
    """
    Generate a student-friendly explanation of verification results using Gemini.
    Uses direct REST API via urllib (no heavy compiled dependencies required).
    Returns dict with 'available', 'text', 'method', 'note'.
    """
    api_key = _load_env_key()

    if not api_key:
        return {
            "available": False,
            "text": None,
            "method": "no_api_key",
            "note": "GEMINI_API_KEY environment variable is not set. Grounded GenAI suggestions are disabled.",
        }

    prompt = _build_prompt(
        opportunity_name=opportunity_name,
        domain=domain,
        eligibility_result=eligibility_result or {},
        field_results=field_results or [],
        comparison_result=comparison_result,
        requirements_text=requirements_text,
        internship_analysis=internship_analysis,
        proof_of_skill=proof_of_skill,
        document_integrity=document_integrity,
    )

    payload = {
        "system_instruction": {
            "parts": [{"text": _SYSTEM_INSTRUCTIONS}]
        },
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 450,
        },
    }

    headers = {"Content-Type": "application/json"}
    body_bytes = json.dumps(payload).encode("utf-8")

    last_error_note = None
    last_error_method = "http_error"

    for model_name in _CANDIDATE_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                res_data = json.loads(response.read().decode("utf-8"))

            candidates = res_data.get("candidates", [])
            if not candidates:
                continue

            content_parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in content_parts).strip()

            if not text:
                continue

            # Safety: ensure disclaimer is present
            if "automated assessment" not in text.lower():
                text += "\n\nThis is an automated assessment suggestion, not an official decision."

            return {
                "available": True,
                "text": text,
                "method": "gemini_rest",
                "model": model_name,
            }

        except urllib.error.HTTPError as http_err:
            status_code = http_err.code
            body_text = http_err.read().decode("utf-8", errors="ignore")
            if status_code in (400, 401, 403):
                # Invalid API credentials: do not keep trying other models
                return {
                    "available": False,
                    "text": None,
                    "method": "auth_error",
                    "note": f"Invalid Gemini API credentials or permissions (HTTP {status_code}). Check your GEMINI_API_KEY.",
                }
            elif status_code == 429:
                last_error_method = "rate_limit"
                last_error_note = "Gemini API rate limit reached. Please try again shortly."
            elif status_code == 503:
                last_error_method = "model_overloaded"
                last_error_note = "Upstream AI model is temporarily overloaded (HTTP 503). Your verification findings are fully preserved."
            elif status_code == 404:
                last_error_method = "model_not_found"
                last_error_note = f"Model {model_name} is not available in current region/endpoint."
            else:
                last_error_method = "http_error"
                last_error_note = f"Gemini API returned HTTP {status_code}."
            # Continue loop to next candidate model
            continue

        except urllib.error.URLError as url_err:
            return {
                "available": False,
                "text": None,
                "method": "network_error",
                "note": f"Could not reach Gemini service: {url_err.reason}",
            }
        except TimeoutError:
            last_error_method = "timeout"
            last_error_note = f"AI service timed out after 12s on model {model_name}."
            continue
        except Exception as e:
            return {
                "available": False,
                "text": None,
                "method": "error",
                "note": f"AI service error: {str(e)[:100]}",
            }

    return {
        "available": False,
        "text": None,
        "method": last_error_method,
        "note": last_error_note or "Upstream AI service is temporarily unavailable. Your verification findings are fully preserved.",
    }
