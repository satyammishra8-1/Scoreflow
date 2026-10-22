import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

import main
from prompts import SYSTEM_PROMPT, build_messages


SAMPLE = {
    "eventName": "TechNova Hackathon",
    "eventType": "Hackathon",
    "teamName": "NovaTech",
    "evaluationType": "criteria-based",
    "projectDescription": "A clear project description.",
    "projectMaterials": [],
    "evaluationAreas": ["Innovation"],
    "evaluations": [{"observations": [], "feedback": "Strong concept.", "performance": []}],
}

REPORT = {
    "summary": "The team presented a promising project.",
    "strengths": ["The concept is clearly described."],
    "weaknesses": ["The submitted feedback requests clearer validation."],
    "whyThisMatters": "Clear validation helps reviewers trust the project's reliability.",
    "improvementSuggestions": ["Add a documented validation plan."],
    "priorityAreas": ["High Priority: Document validation and test edge cases."],
    "judgeFeedbackSummary": "The judge highlighted a strong concept.",
    "finalRemarks": "Continue refining the project with evidence from testing.",
}


class ResultReportServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_request_returns_validated_structured_report(self):
        parsed = main.ReportContent(**REPORT)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(
            main, "generate_report", new=AsyncMock(return_value=(parsed, "test-model"))
        ):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["report"], REPORT)
        self.assertEqual(response.json()["model"], "test-model")

    async def test_missing_provider_key_is_reported_without_fake_success(self):
        with patch.dict(os.environ, {}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(response.status_code, 503)

    async def test_numeric_score_fields_are_rejected_by_request_schema(self):
        invalid = {**SAMPLE, "finalScore": 92}
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/reports/generate", json=invalid)
        self.assertEqual(response.status_code, 422)

    async def test_all_six_evaluation_types_are_supported(self):
        transport = httpx.ASGITransport(app=main.app)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(
            main, "generate_report", new=AsyncMock(return_value=(main.ReportContent(**REPORT), "test-model"))
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for evaluation_type in ["criteria-based", "open-holistic", "remote-async", "live-demo", "ranking-voting", "custom"]:
                    response = await client.post("/reports/generate", json={**SAMPLE, "evaluationType": evaluation_type})
                    self.assertEqual(response.status_code, 200, evaluation_type)

    def test_bad_report_fields_fail_pydantic_validation(self):
        with self.assertRaises(ValidationError):
            main.ReportContent(**{**REPORT, "strengths": []})

    def test_numeric_evaluation_content_fails_pydantic_validation(self):
        with self.assertRaises(ValidationError):
            main.ReportContent(**{**REPORT, "summary": "The team earned 92 percent."})
        with self.assertRaises(ValidationError):
            main.ReportContent(**{**REPORT, "summary": "The team finished first."})
        with self.assertRaises(ValidationError):
            main.ReportContent(**{**REPORT, "finalRemarks": "AI Generated: keep iterating."})

    async def test_official_sdk_response_parser_is_used_and_validated(self):
        parsed = main.ReportContent(**REPORT)
        parse = AsyncMock(return_value=SimpleNamespace(output_parsed=parsed))
        fake_client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
        with patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "unit-test-key", "OPENAI_MODEL": "test-model"}), patch.object(
            main, "AsyncOpenAI", return_value=fake_client
        ):
            report, model = await main.generate_report(main.ReportRequest(**SAMPLE))
        self.assertEqual(report, parsed)
        self.assertEqual(model, "test-model")
        self.assertIs(parse.call_args.kwargs["text_format"], main.RawReportContent)
        self.assertNotIn("finalScore", parse.call_args.kwargs["input"][1]["content"])
        self.assertIn("Never mention or reveal numeric scores", parse.call_args.kwargs["input"][0]["content"])

    async def test_gemini_uses_official_sdk_pydantic_schema_and_validates_response(self):
        parsed = main.ReportContent(**REPORT)
        generate_content = AsyncMock(return_value=SimpleNamespace(text=parsed.model_dump_json()))
        close = AsyncMock()
        fake_client = SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content),
                aclose=close,
            )
        )
        with patch.dict(os.environ, {"GEMINI_API_KEY": "unit-test-key", "GEMINI_MODEL": "gemini-test"}), patch.object(
            main.genai, "Client", return_value=fake_client
        ) as client_factory:
            report, model = await main.generate_report(main.ReportRequest(**SAMPLE))
        self.assertEqual(report, parsed)
        self.assertEqual(model, "gemini-test")
        client_factory.assert_called_once()
        kwargs = generate_content.call_args.kwargs
        self.assertEqual(kwargs["model"], "gemini-test")
        self.assertEqual(kwargs["config"].response_mime_type, "application/json")
        self.assertIs(kwargs["config"].response_schema, main.GeminiReportSchema)
        self.assertEqual(list(main.GeminiReportSchema.model_fields), list(main.ReportContent.model_fields))
        original_schema = main.ReportContent.model_json_schema()
        original_schema.pop("additionalProperties")
        original_schema["title"] = main.GeminiReportSchema.__name__
        self.assertEqual(main.GeminiReportSchema.model_json_schema(), original_schema)
        self.assertEqual(main.ReportContent.model_config["extra"], "forbid")
        self.assertNotIn("finalScore", kwargs["contents"])
        self.assertNotIn("92", kwargs["contents"])
        close.assert_awaited_once()

    async def test_gemini_missing_key_fails_without_request(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], {
            "provider": "gemini", "code": "missing_api_key", "reason": "GEMINI_API_KEY is not configured"
        })

    async def test_invalid_gemini_structured_response_is_rejected(self):
        generate_content = AsyncMock(return_value=SimpleNamespace(text='{"summary":"incomplete"}'))
        close = AsyncMock()
        fake_client = SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content),
                aclose=close,
            )
        )
        with patch.dict(os.environ, {"GEMINI_API_KEY": "unit-test-key"}), patch.object(
            main.genai, "Client", return_value=fake_client
        ):
            with self.assertRaises(main.ProviderResponseError):
                await main.generate_report(main.ReportRequest(**SAMPLE))
        close.assert_awaited_once()

    async def test_gemini_default_model_and_provider_errors_are_classified(self):
        for error, expected in [
            (RuntimeError("API key is invalid"), "invalid_api_key"),
            (RuntimeError("RESOURCE_EXHAUSTED: quota exceeded"), "quota_exhausted"),
            (RuntimeError("model not found"), "model_unavailable"),
            (TimeoutError("timed out"), "timeout"),
            (ConnectionError("network unavailable"), "network_error"),
        ]:
            generate_content = AsyncMock(side_effect=error)
            close = AsyncMock()
            fake_client = SimpleNamespace(aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content), aclose=close
            ))
            env = {"GEMINI_API_KEY": "unit-test-key"}
            with patch.dict(os.environ, env, clear=True), patch.object(main.genai, "Client", return_value=fake_client):
                with self.assertRaises(main.ProviderResponseError) as raised:
                    await main.generate_report(main.ReportRequest(**SAMPLE))
            self.assertEqual(raised.exception.code, expected)
            self.assertNotIn("unit-test-key", str(raised.exception))
            self.assertEqual(generate_content.call_args.kwargs["model"], "gemini-3.5-flash-lite")
            close.assert_awaited_once()

    def test_gemini_http_status_codes_are_classified(self):
        class StatusError(RuntimeError):
            def __init__(self, status):
                super().__init__("Provider request failed")
                self.code = status

        self.assertEqual(main._classify_gemini_error(StatusError(401))[0], "invalid_api_key")
        self.assertEqual(main._classify_gemini_error(StatusError(429))[0], "quota_exhausted")
        self.assertEqual(main._classify_gemini_error(StatusError(404))[0], "model_unavailable")

    async def test_health_reports_gemini_configuration_without_calling_provider(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "unit-test-key"}, clear=True):
            result = await main.health()
        self.assertEqual(result, {
            "status": "ok", "provider": "gemini", "model": "gemini-3.5-flash-lite", "configured": True
        })

    def test_prompt_explicitly_requires_qualitative_team_facing_report(self):
        messages = build_messages(SAMPLE)
        self.assertIn("experienced competition mentor", SYSTEM_PROMPT)
        self.assertIn("Never mention or reveal numeric scores", SYSTEM_PROMPT)
        self.assertIn("vote counts", SYSTEM_PROMPT)
        self.assertIn("Actionable Recommendations", messages[1]["content"])
        self.assertIn("Why This Matters", SYSTEM_PROMPT)
        self.assertIn("Priority Areas", SYSTEM_PROMPT)
        self.assertIn("do not recalculate or aggregate scores", SYSTEM_PROMPT)
        self.assertNotIn("finalScore", messages[1]["content"])

    def test_performance_indicators_are_private_reasoning_context_and_change_with_performance(self):
        strong_technical = {**SAMPLE, "evaluations": [{
            "observations": [{"area": "Presentation", "response": "The architecture was hard to follow."}],
            "feedback": "Clarify the demonstration flow.",
            "performance": [{"area": "Technical implementation", "value": 36, "maxValue": 40, "weight": 50, "kind": "criterion", "betterWhen": "higher"}],
        }]}
        weak_technical = {**strong_technical, "evaluations": [{
            **strong_technical["evaluations"][0],
            "performance": [{"area": "Technical implementation", "value": 12, "maxValue": 40, "weight": 50, "kind": "criterion", "betterWhen": "higher"}],
        }]}
        strong_message = build_messages(strong_technical)[1]["content"]
        weak_message = build_messages(weak_technical)[1]["content"]
        self.assertIn('"value":36', strong_message)
        self.assertIn('"value":12', weak_message)
        self.assertNotEqual(strong_message, weak_message)
        self.assertIn("Do not include numeric evaluation results", strong_message)

    def test_unsafe_numeric_and_ai_attribution_sentences_are_removed_before_response(self):
        raw = main.RawReportContent(**{
            **REPORT,
            "summary": "Technical validation is a strength. The score was 92 percent. Presentation needs a clearer flow.",
            "finalRemarks": "AI Generated: keep iterating. Use future feedback to guide the next revision.",
        })
        report = main._sanitize_report_content(raw)
        content = report.model_dump_json()
        self.assertIn("Technical validation is a strength", content)
        self.assertIn("Presentation needs a clearer flow", content)
        self.assertIn("Use future feedback", content)
        self.assertNotRegex(content, r"\d|AI\s*(?:generated|powered)|Generated by AI")


if __name__ == "__main__":
    unittest.main()
