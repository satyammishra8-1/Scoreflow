import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

import main
from prompts import SYSTEM_PROMPT, build_messages


SAMPLE = {
    "eventName": "TechNova Hackathon 2026",
    "eventType": "Hackathon",
    "teamName": "NovaTech",
    "teamNumber": "1",
    "finalScore": 60.25,
    "scoreMaximum": 100,
    "criteria": [{"name": "Innovation", "maximumMarks": 30, "weight": 30, "judgeScores": [27, 25], "averageScore": 26}],
    "evaluations": [{"judgeName": "Judge One", "status": "COMPLETED", "criteriaScores": [], "feedback": "Strong concept."}],
    "evaluationStatus": "Completed",
}

REPORT = {
    "summary": "The team presented a promising project.",
    "strengths": ["The concept is clearly described."],
    "weaknesses": ["The submitted feedback requests clearer validation."],
    "improvementSuggestions": ["Add a documented validation plan."],
    "priorityAreas": ["Validation"],
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

    async def test_invalid_verified_input_is_rejected_by_request_schema(self):
        invalid = {**SAMPLE, "finalScore": 101}
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/reports/generate", json=invalid)
        self.assertEqual(response.status_code, 422)

    def test_bad_report_fields_fail_pydantic_validation(self):
        with self.assertRaises(ValidationError):
            main.ReportContent(**{**REPORT, "strengths": []})

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
        self.assertIs(parse.call_args.kwargs["text_format"], main.ReportContent)
        self.assertIn('"finalScore":60.25', parse.call_args.kwargs["input"][1]["content"])

    async def test_gemini_uses_official_sdk_json_schema_and_validates_response(self):
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
        self.assertEqual(kwargs["config"].response_schema, main._gemini_report_schema())
        self.assertNotIn("additionalProperties", kwargs["config"].response_schema)
        self.assertIn('"finalScore":60.25', kwargs["contents"])
        close.assert_awaited_once()

    async def test_gemini_missing_key_fails_without_request(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}, clear=True):
            with self.assertRaises(main.ProviderConfigurationError):
                await main.generate_report(main.ReportRequest(**SAMPLE))

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

    def test_prompt_preserves_score_authority_and_uses_only_supplied_input(self):
        messages = build_messages(SAMPLE)
        self.assertIn("Do not calculate, change, infer, or invent scores", SYSTEM_PROMPT)
        self.assertIn('"finalScore":60.25', messages[1]["content"])


if __name__ == "__main__":
    unittest.main()
