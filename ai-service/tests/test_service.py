import os
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

os.environ.setdefault("AI_SERVICE_SHARED_SECRET", "test-service-secret")
import main
from prompts import (
    SYSTEM_PROMPT,
    build_messages,
    EVALUATION_SCHEMA_SYSTEM_PROMPT,
    build_evaluation_schema_messages,
)


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

SCHEMA = {
    "title": "Project Review",
    "description": "A structured evaluation rubric.",
    "sections": [{
        "id": "implementation",
        "name": "Implementation",
        "description": "",
        "fields": [
            {"id": "reliability", "type": "score", "label": "Reliability", "description": "", "rationale": "Measures dependable behavior.", "required": True, "maxMarks": 10, "weight": 100},
            {"id": "safety", "type": "group", "label": "Safety checks", "description": "", "rationale": "", "required": True, "children": [
                {"id": "compliant", "type": "boolean", "label": "Meets safety requirements", "description": "", "rationale": "Confirms the required checks.", "required": True},
                {"id": "evidence", "type": "question", "label": "Safety evidence", "description": "", "rationale": "Captures observed evidence.", "required": False},
                {"id": "category", "type": "single_select", "label": "Risk level", "description": "", "rationale": "Makes risk consistent.", "required": True, "options": ["Low", "Medium", "High"]},
            ]},
        ],
    }],
}

SCHEMA_REQUEST = {
    "prompt": "Build a practical project exhibition evaluation with reliability and safety checks.",
    "eventName": "Project Showcase",
    "eventType": "Project Competition",
    "eventDescription": "Student projects for community use.",
    "evaluationModel": "criteria-based",
    "existingCriteria": ["Innovation", "Technical Implementation"],
    "existingConfiguration": {"criteriaBased": {"criteria": [{"name": "Innovation", "weight": 60}]}},
}



class ResultReportServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_service_secret_returns_actionable_configuration_error(self):
        with patch.dict(os.environ, {}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/evaluation-schema/generate", json=SCHEMA_REQUEST)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "missing_service_secret")
        self.assertIn("same AI_SERVICE_SHARED_SECRET", response.json()["detail"]["reason"])

    async def test_generation_endpoint_rejects_missing_or_invalid_node_secret(self):
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            missing = await client.post("/reports/generate", json=SAMPLE)
        async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "wrong"}) as client:
            invalid = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(invalid.status_code, 401)

    async def test_valid_request_returns_validated_structured_report(self):
        parsed = main.ReportContent(**REPORT)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(
            main, "generate_report", new=AsyncMock(return_value=(parsed, "test-model"))
        ):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["report"], REPORT)
        self.assertEqual(response.json()["model"], "test-model")

    async def test_missing_provider_key_is_reported_without_fake_success(self):
        with patch.dict(os.environ, {"AI_SERVICE_SHARED_SECRET": "test-service-secret"}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/reports/generate", json=SAMPLE)
        self.assertEqual(response.status_code, 503)

    async def test_numeric_score_fields_are_rejected_by_request_schema(self):
        invalid = {**SAMPLE, "finalScore": 92}
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
            response = await client.post("/reports/generate", json=invalid)
        self.assertEqual(response.status_code, 422)

    async def test_all_six_evaluation_types_are_supported(self):
        transport = httpx.ASGITransport(app=main.app)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(
            main, "generate_report", new=AsyncMock(return_value=(main.ReportContent(**REPORT), "test-model"))
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
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
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "AI_SERVICE_SHARED_SECRET": "test-service-secret"}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
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
            (RuntimeError("models/gemini-test is not found for generateContent"), "model_unavailable"),
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
        class ApiError(RuntimeError):
            def __init__(self, http_status, provider_status, message, reasons=None):
                super().__init__(message)
                self.code = http_status
                self.status = provider_status
                self.details = {"error": {"code": http_status, "status": provider_status, "message": message,
                                           "details": [{"reason": reason} for reason in (reasons or [])]}}

        self.assertEqual(main._classify_gemini_error(ApiError(401, "UNAUTHENTICATED", "API key not valid"))[0], "invalid_api_key")
        self.assertEqual(main._classify_gemini_error(ApiError(403, "PERMISSION_DENIED", "Permission denied"))[0], "permission_denied")
        self.assertEqual(main._classify_gemini_error(ApiError(429, "RESOURCE_EXHAUSTED", "Quota exceeded"))[0], "quota_exhausted")
        self.assertEqual(main._classify_gemini_error(ApiError(400, "INVALID_ARGUMENT", "Unsupported response parameter"))[0], "invalid_request")
        model_error = ApiError(404, "NOT_FOUND", "models/gemini-example is not found for generateContent", ["MODEL_NOT_FOUND"])
        self.assertEqual(main._classify_gemini_error(model_error)[0], "model_unavailable")
        generic_404 = ApiError(404, "NOT_FOUND", "The requested resource was not found")
        self.assertEqual(main._classify_gemini_error(generic_404)[0], "provider_error")

        with self.assertLogs(main.logger, level="WARNING") as captured:
            main._safe_provider_error(ApiError(404, "NOT_FOUND", "models/x not found; sensitive prompt and unit-test-key", ["MODEL_NOT_FOUND"]), "LLM evaluation schema")
        output = " ".join(captured.output)
        self.assertIn("http_status=404", output)
        self.assertIn("MODEL_NOT_FOUND", output)
        self.assertNotIn("sensitive prompt", output)
        self.assertNotIn("unit-test-key", output)

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


class EvaluationSchemaServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_nested_schema_supports_score_boolean_question_and_select_fields(self):
        schema = main.EvaluationSchema.model_validate(SCHEMA)
        self.assertEqual(schema.sections[0].fields[1].children[0].type, "boolean")
        self.assertEqual(schema.sections[0].fields[1].children[2].options, ["Low", "Medium", "High"])
        self.assertFalse(schema.sections[0].fields[1].required)

    def test_unsupported_field_type_is_rejected(self):
        invalid = {**SCHEMA, "sections": [{**SCHEMA["sections"][0], "fields": [{**SCHEMA["sections"][0]["fields"][0], "type": "javascript"}]}]}
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate(invalid)

    def test_malformed_structure_and_extra_executable_content_are_rejected(self):
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate({**SCHEMA, "sections": []})
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate({**SCHEMA, "script": "<script>alert(1)</script>"})

    def test_duplicate_sibling_names_and_section_names_are_rejected(self):
        duplicate_field = {**SCHEMA, "sections": [{**SCHEMA["sections"][0], "fields": [
            SCHEMA["sections"][0]["fields"][0],
            {**SCHEMA["sections"][0]["fields"][0], "id": "second_score", "label": "reliability"},
        ]}]}
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate(duplicate_field)
        duplicate_section = {**SCHEMA, "sections": [SCHEMA["sections"][0], {**SCHEMA["sections"][0], "id": "second_section", "name": "implementation"}]}
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate(duplicate_section)

    def test_duplicate_field_names_across_sections_are_rejected_but_section_field_names_may_match(self):
        first_section = SCHEMA["sections"][0]
        duplicate = {**SCHEMA, "sections": [
            first_section,
            {"id": "second_section", "name": "Follow-up", "description": "", "fields": [
                {**first_section["fields"][0], "id": "second_reliability"},
            ]},
        ]}
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate(duplicate)

        matching = {**SCHEMA, "sections": [{**first_section, "fields": [
            {**first_section["fields"][0], "label": first_section["name"]},
        ]}]}
        main.EvaluationSchema.model_validate(matching)

    def test_score_weights_must_total_one_hundred(self):
        invalid = {**SCHEMA, "sections": [{**SCHEMA["sections"][0], "fields": [{**SCHEMA["sections"][0]["fields"][0], "weight": 80}, SCHEMA["sections"][0]["fields"][1]]}]}
        with self.assertRaises(ValidationError):
            main.EvaluationSchema.model_validate(invalid)

    def test_required_field_flag_is_mandatory(self):
        field = dict(SCHEMA["sections"][0]["fields"][0])
        del field["required"]
        with self.assertRaises(ValidationError):
            main.EvaluationSchemaField.model_validate(field)

    def test_existing_criteria_are_removed_and_generated_weights_rebalanced(self):
        duplicate = {**SCHEMA, "sections": [{**SCHEMA["sections"][0], "fields": [
            {**SCHEMA["sections"][0]["fields"][0], "weight": 40},
            {"id": "impact", "type": "score", "label": "Community impact", "description": "", "rationale": "Explains reach.", "required": True, "maxMarks": 10, "weight": 60},
        ]}]}
        request = main.EvaluationSchemaRequest(**{**SCHEMA_REQUEST, "existingCriteria": ["Reliability"]})
        result = main._remove_existing_schema_criteria(main.EvaluationSchema.model_validate(duplicate), request)
        self.assertEqual([field.label for field in result.sections[0].fields], ["Community impact"])
        self.assertEqual(result.sections[0].fields[0].weight, 100)

    def test_prompt_includes_event_context_duplicate_guidance_and_schema_safety(self):
        messages = build_evaluation_schema_messages(SCHEMA_REQUEST)
        self.assertIn("do not duplicate existing criteria or any field name elsewhere", EVALUATION_SCHEMA_SYSTEM_PROMPT.lower())
        self.assertIn("do not default to hackathon criteria", EVALUATION_SCHEMA_SYSTEM_PROMPT.lower())
        self.assertIn("one required question field", EVALUATION_SCHEMA_SYSTEM_PROMPT.lower())
        self.assertIn("scoring guidance", EVALUATION_SCHEMA_SYSTEM_PROMPT.lower())
        self.assertIn("subcriteria", messages[1]["content"].lower())
        self.assertIn("Innovation", messages[1]["content"])
        self.assertIn("Project Showcase", messages[1]["content"])
        self.assertIn("not evaluating participants", messages[0]["content"])
        self.assertNotIn("JSX", messages[1]["content"])

    def test_repair_prompt_has_specific_validation_guidance(self):
        messages = build_evaluation_schema_messages(SCHEMA_REQUEST, repair_attempt=True)
        self.assertIn("previous draft failed schema validation", messages[1]["content"])
        self.assertIn("score weights totaling exactly 100", messages[1]["content"])

    async def test_malformed_schema_gets_exactly_one_controlled_repair_attempt(self):
        repair_schema = main.EvaluationSchema.model_validate(SCHEMA).model_dump()
        repair_schema["sections"][0]["fields"][0]["description"] = "Score observable reliability in the submitted solution."
        repair_schema["sections"][0]["fields"][0]["rationale"] = "Reliability matters for safe, repeatable use."
        repair_schema["sections"][0]["fields"].append({
            "id": "reliability_question", "type": "question", "label": "Reliability question",
            "description": "What evidence demonstrates reliable behavior?", "rationale": "Collect evidence for the score.", "required": True,
        })
        parsed = main.EvaluationSchema.model_validate(repair_schema)
        failure = main.ProviderResponseError("malformed_response", "Invalid output")
        generate = AsyncMock(side_effect=[failure, (parsed, "test-model")])
        request = main.EvaluationSchemaRequest(**SCHEMA_REQUEST)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(main, "_generate_schema_with_gemini", new=generate):
            schema, model = await main.generate_evaluation_schema(request)
        self.assertEqual(schema.title, "Project Review")
        self.assertEqual(model, "test-model")
        self.assertEqual(generate.await_count, 2)
        self.assertEqual(generate.await_args_list[0].kwargs["repair_attempt"], False)
        self.assertEqual(generate.await_args_list[1].kwargs["repair_attempt"], True)

    async def test_provider_connectivity_failure_does_not_trigger_repair_retry(self):
        failure = main.ProviderResponseError("network_error", "Could not connect to provider")
        generate = AsyncMock(side_effect=failure)
        request = main.EvaluationSchemaRequest(**SCHEMA_REQUEST)
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(main, "_generate_schema_with_gemini", new=generate):
            with self.assertRaises(main.ProviderResponseError):
                await main.generate_evaluation_schema(request)
        self.assertEqual(generate.await_count, 1)

    async def test_generation_supports_varied_domains_and_simple_medium_complex_requests(self):
        def score_field(field_id, label, weight):
            return {"id": field_id, "type": "score", "label": label, "description": "", "rationale": "", "required": True, "maxMarks": 10, "weight": weight}

        domains = ["Hackathon", "Startup Pitch", "Debate Competition", "Dance Competition", "Poster Exhibition", "Coding Competition", "Sports Performance", "Academic Presentation"]
        domain_outputs = []
        for index, domain in enumerate(domains):
            output = {"title": f"{domain} review", "description": "", "sections": [{
                "id": f"domain_{index}", "name": f"{domain} evaluation", "description": "",
                "fields": [score_field(f"score_{index}", f"{domain} quality", 100)],
            }]}
            domain_outputs.append(main.EvaluationSchema.model_validate(output))

        simple = main.EvaluationSchema.model_validate({"title": "Simple review", "description": "", "sections": [{
            "id": "simple", "name": "Core dimensions", "description": "", "fields": [
                score_field("simple_innovation", "Innovation", 34),
                score_field("simple_technical", "Technical quality", 33),
                score_field("simple_presentation", "Presentation", 33),
            ],
        }]})
        medium = main.EvaluationSchema.model_validate({"title": "Pitch review", "description": "", "sections": [{
            "id": "medium", "name": "Pitch dimensions", "description": "", "fields": [
                score_field("medium_problem", "Problem", 20), score_field("medium_solution", "Solution", 20),
                score_field("medium_innovation", "Innovation", 20), score_field("medium_business", "Business model", 20),
                score_field("medium_presentation", "Presentation", 20),
            ],
        }]})
        complex_schema = main.EvaluationSchema.model_validate({"title": "Startup pitch review", "description": "", "sections": [
            {"id": "problem_section", "name": "Problem", "description": "", "fields": [score_field("problem", "Problem clarity", 15)]},
            {"id": "solution_section", "name": "Solution", "description": "", "fields": [score_field("solution", "Solution quality", 15)]},
            {"id": "innovation_section", "name": "Innovation", "description": "", "fields": [score_field("innovation", "Innovation", 15)]},
            {"id": "business_section", "name": "Business Model", "description": "", "fields": [{"id": "business_group", "type": "group", "label": "Business Model", "description": "", "rationale": "", "required": False, "children": [score_field("revenue", "Revenue model", 10), score_field("feasibility", "Feasibility", 10)]}]},
            {"id": "market_section", "name": "Market", "description": "", "fields": [{"id": "market_group", "type": "group", "label": "Market", "description": "", "rationale": "", "required": False, "children": [{"id": "audience", "type": "question", "label": "Target audience", "description": "", "rationale": "", "required": True}, score_field("scalability", "Scalability", 10)]}]},
            {"id": "presentation_section", "name": "Presentation", "description": "", "fields": [score_field("presentation", "Presentation", 15)]},
            {"id": "qa_section", "name": "Questions", "description": "", "fields": [score_field("qa_score", "Q&A", 10), {"id": "judge_question", "type": "question", "label": "Judge question", "description": "", "rationale": "", "required": True}, {"id": "final_feedback", "type": "feedback", "label": "Final qualitative feedback", "description": "", "rationale": "", "required": True}]},
        ]})

        request_base = {**SCHEMA_REQUEST, "existingCriteria": []}
        requests = [
            main.EvaluationSchemaRequest(**{**request_base, "prompt": "Evaluate innovation, technical quality and presentation."}),
            main.EvaluationSchemaRequest(**{**request_base, "prompt": "Evaluate a startup pitch with problem, solution, innovation, business model and presentation."}),
            main.EvaluationSchemaRequest(**{**request_base, "prompt": "Evaluate a startup pitch using sections for Problem, Solution, Innovation, Business Model, Market and Presentation. Business Model should contain revenue model and feasibility. Market should contain target audience and scalability. Include numeric scoring, weights, required judge questions and final qualitative feedback."}),
        ]
        results = [*domain_outputs, simple, medium, complex_schema]
        def add_rubric_guidance(schema):
            payload = schema.model_dump()
            def complete(fields):
                additions = []
                for field in list(fields):
                    if field["type"] == "score":
                        field["description"] = field["description"] or f"Score observable evidence for {field['label'].lower()}."
                        field["rationale"] = field["rationale"] or f"{field['label']} is relevant to this event."
                        additions.append({"id": f"q_{field['id'][:47]}", "type": "question", "label": f"{field['label']} question",
                                          "description": f"What evidence demonstrates {field['label'].lower()}?",
                                          "rationale": "Collect evidence for the matching score.", "required": True})
                    elif field["type"] == "group":
                        complete(field.get("children") or [])
                fields.extend(additions)
            for section in payload["sections"]:
                complete(section["fields"])
            return main.EvaluationSchema.model_validate(payload)
        results = [add_rubric_guidance(result) for result in results]
        generator = AsyncMock(side_effect=[(result, "schema-test") for result in results])
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini"}), patch.object(main, "_generate_schema_with_gemini", new=generator):
            generated = []
            for index, request in enumerate([*[
                main.EvaluationSchemaRequest(**{**request_base, "prompt": f"Create a {domain} judge evaluation."}) for domain in domains
            ], *requests]):
                schema, _ = await main.generate_evaluation_schema(request)
                generated.append(schema)
        self.assertEqual([item.title for item in generated[:8]], [f"{domain} review" for domain in domains])
        self.assertFalse(any(field.type == "group" for section in generated[8].sections for field in section.fields))
        business_children = generated[10].sections[3].fields[0].children
        self.assertEqual(sum(child.type == "score" for child in business_children), 2)
        self.assertEqual([child.label for child in business_children if child.type == "score"], ["Revenue model", "Feasibility"])
        self.assertEqual(generated[10].sections[4].fields[0].children[0].label, "Target audience")
        self.assertTrue(any(field.type == "question" for section in generated[10].sections for field in section.fields))

    async def test_endpoint_returns_a_validated_nested_schema(self):
        parsed = main.EvaluationSchema.model_validate(SCHEMA)
        with patch.object(main, "generate_evaluation_schema", new=AsyncMock(return_value=(parsed, "test-model"))):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/evaluation-schema/generate", json=SCHEMA_REQUEST)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["evaluationSchema"]["title"], "Project Review")
        self.assertEqual(response.json()["evaluationSchema"]["sections"][0]["fields"][1]["children"][0]["type"], "boolean")

    async def test_invalid_request_is_rejected_before_provider_call(self):
        generate = AsyncMock()
        with patch.object(main, "generate_evaluation_schema", new=generate):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/evaluation-schema/generate", json={**SCHEMA_REQUEST, "unknown": "value"})
        self.assertEqual(response.status_code, 422)
        generate.assert_not_awaited()

    async def test_missing_gemini_key_returns_actionable_schema_configuration_error(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "AI_SERVICE_SHARED_SECRET": "test-service-secret"}, clear=True):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/evaluation-schema/generate", json=SCHEMA_REQUEST)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "missing_api_key")
        self.assertEqual(response.json()["detail"]["reason"], "GEMINI_API_KEY is not configured")

    async def test_gemini_malformed_json_is_rejected_as_malformed_response(self):
        generate_content = AsyncMock(return_value=SimpleNamespace(text='{"title":'))
        close = AsyncMock()
        fake_client = SimpleNamespace(aio=SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content), aclose=close
        ))
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "unit-test-key"}), patch.object(main.genai, "Client", return_value=fake_client):
            with self.assertRaises(main.ProviderResponseError) as raised:
                await main.generate_evaluation_schema(main.EvaluationSchemaRequest(**SCHEMA_REQUEST))
        self.assertEqual(raised.exception.code, "malformed_response")
        self.assertNotIn("unit-test-key", str(raised.exception))
        self.assertEqual(generate_content.await_count, 2)
        self.assertEqual(close.await_count, 2)

    async def test_provider_failure_does_not_return_a_fake_schema(self):
        failure = main.ProviderResponseError("malformed_response", "The model returned an invalid schema")
        with patch.object(main, "generate_evaluation_schema", new=AsyncMock(side_effect=failure)):
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-ScoreFlow-Service-Token": "test-service-secret"}) as client:
                response = await client.post("/evaluation-schema/generate", json=SCHEMA_REQUEST)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["code"], "malformed_response")

    async def test_gemini_uses_structured_schema_and_removes_existing_criteria(self):
        generate_content = AsyncMock(return_value=SimpleNamespace(text=main.EvaluationSchema.model_validate(SCHEMA).model_dump_json()))
        close = AsyncMock()
        fake_client = SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content),
                aclose=close,
            )
        )
        request = main.EvaluationSchemaRequest(**{**SCHEMA_REQUEST, "existingCriteria": ["Reliability"]})
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "unit-test-key", "GEMINI_MODEL": "schema-test"}), patch.object(main.genai, "Client", return_value=fake_client):
            schema, model = await main.generate_evaluation_schema(request)
        self.assertEqual(model, "schema-test")
        self.assertEqual(schema.sections[0].fields[0].type, "group")
        self.assertEqual(generate_content.call_args.kwargs["config"].response_mime_type, "application/json")
        self.assertIs(generate_content.call_args.kwargs["config"].response_schema, main.GeminiEvaluationSchema)
        close.assert_awaited_once()

    async def test_five_event_categories_use_domain_context_and_return_complete_rubrics(self):
        categories = [
            ("Healthcare innovation hackathon", "Clinical safety", "How does the solution protect patient safety?"),
            ("Cybersecurity challenge", "Threat analysis", "What evidence supports the threat analysis?"),
            ("Startup investor pitch competition", "Market opportunity", "What validates the target market opportunity?"),
            ("Product design competition", "Accessibility", "How does the design support accessible use?"),
            ("Robotics competition", "Autonomous control", "How reliably does the robot act autonomously?"),
        ]
        responses = []
        requests = []
        for index, (event_name, criterion, question) in enumerate(categories):
            requests.append(main.EvaluationSchemaRequest(
                prompt=f"Create an event-specific rubric for {event_name}.", eventName=event_name,
                eventType=event_name, eventDescription=f"Teams compete in {event_name}.",
                evaluationModel="criteria-based", existingCriteria=[],
            ))
            responses.append(SimpleNamespace(text=json.dumps({
                "title": f"{event_name} rubric", "description": "Event-specific judge evaluation.",
                "sections": [{"id": f"domain_{index}", "name": "Evaluation", "description": "",
                              "fields": [
                                  {"id": f"criterion_{index}", "type": "score", "label": criterion,
                                   "description": f"Score observable evidence for {criterion.lower()}.",
                                   "rationale": f"{criterion} is central to this event.", "required": True,
                                   "maxMarks": 10, "weight": 40},
                                  {"id": f"question_{index}", "type": "question", "label": f"{criterion} question",
                                   "description": question, "rationale": "Collect evidence for the matching score.",
                                   "required": True},
                                  {"id": f"second_{index}", "type": "score", "label": f"Evidence quality for {criterion}",
                                   "description": f"Score the quality of evidence for {criterion.lower()}.",
                                   "rationale": f"Evidence supports consistent assessment of {criterion.lower()}.",
                                   "required": True, "maxMarks": 10, "weight": 59},
                                  {"id": f"second_question_{index}", "type": "question", "label": f"Evidence quality for {criterion} question",
                                   "description": f"What evidence demonstrates {criterion.lower()}?",
                                   "rationale": "Collect evidence for the matching score.", "required": True},
                              ]}]
            })))

        generate_content = AsyncMock(side_effect=responses)
        close = AsyncMock()
        fake_client = SimpleNamespace(aio=SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content), aclose=close
        ))
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "unit-test-key", "GEMINI_MODEL": "gemini-test"}), patch.object(main.genai, "Client", return_value=fake_client):
            generated = [await main.generate_evaluation_schema(request) for request in requests]

        for index, ((schema, model), (event_name, criterion, _)) in enumerate(zip(generated, categories)):
            fields = [field for section in schema.sections for field in section.fields]
            scores = [field for field in fields if field.type == "score"]
            questions = [field for field in fields if field.type == "question"]
            self.assertEqual(model, "gemini-test")
            self.assertIn(criterion, schema.model_dump_json())
            self.assertEqual(sum(field.weight for field in scores), 100.0)
            self.assertEqual(len(questions), len(scores))
            for score in scores:
                self.assertTrue(score.description.strip())
                self.assertTrue(score.rationale.strip())
                matching = [question for question in questions if question.label.casefold().startswith(score.label.casefold())]
                self.assertEqual(len(matching), 1, event_name)
                self.assertTrue(matching[0].required)
            self.assertIn(event_name, generate_content.call_args_list[index].kwargs["contents"])
        self.assertEqual(close.await_count, len(categories))


if __name__ == "__main__":
    unittest.main()
