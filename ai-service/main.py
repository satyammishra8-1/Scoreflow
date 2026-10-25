import os
import logging
import re
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import AsyncOpenAI
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from prompts import (
    build_messages,
    build_evaluation_schema_messages,
    build_announcement_email_messages,
    build_judge_invitation_email_messages,
)

load_dotenv()

PROMPT_VERSION = "result-report-v2"
logger = logging.getLogger("scoreflow.ai_service")
NUMERIC_EVALUATION_PATTERN = re.compile(
    r"\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b"
    r"|\b(?:placed|finished|came\s+in)\s+(?:first|second|third|last)\b"
    r"|\b(?:first|second|third|last)\s+place\b"
    r"|\btop\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b"
    r"|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+out\s+of\s+"
    r"(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b",
    re.IGNORECASE,
)
AI_ATTRIBUTION_PATTERN = re.compile(r"\bAI\s*(?:generated|powered)\b|\bgenerated\s+by\s+AI\b", re.IGNORECASE)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


EvaluationType = Literal[
    "criteria-based", "open-holistic", "remote-async", "live-demo", "ranking-voting", "custom"
]


class ObservationInput(StrictModel):
    area: str = Field(min_length=1, max_length=200)
    response: str = Field(min_length=1, max_length=4000)


class PerformanceIndicator(StrictModel):
    area: str = Field(min_length=1, max_length=200)
    value: float
    maxValue: float | None = Field(default=None, gt=0)
    weight: float | None = Field(default=None, ge=0)
    kind: Literal["criterion", "overall", "rank", "votes", "custom"]
    betterWhen: Literal["higher", "lower"]


class EvaluationInput(StrictModel):
    observations: list[ObservationInput] = Field(max_length=100)
    feedback: str = Field(max_length=4000)
    performance: list[PerformanceIndicator] = Field(max_length=100)


class ReportRequest(StrictModel):
    eventName: str = Field(min_length=1, max_length=200)
    eventType: str = Field(min_length=1, max_length=100)
    teamName: str = Field(min_length=1, max_length=200)
    evaluationType: EvaluationType
    projectDescription: str = Field(max_length=4000)
    projectMaterials: list[str] = Field(max_length=100)
    evaluationAreas: list[str] = Field(max_length=100)
    evaluations: list[EvaluationInput] = Field(min_length=1, max_length=20)


class ReportContentFields(StrictModel):
    summary: str = Field(min_length=1, max_length=4000)
    strengths: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    weaknesses: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    whyThisMatters: str = Field(min_length=1, max_length=4000)
    improvementSuggestions: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    priorityAreas: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=5)
    judgeFeedbackSummary: str = Field(min_length=1, max_length=4000)
    finalRemarks: str = Field(min_length=1, max_length=4000)


class RawReportContent(ReportContentFields):
    """Provider schema accepted before unsafe numeric or attribution text is removed."""


class ReportContent(ReportContentFields):
    @model_validator(mode="after")
    def _validate_qualitative_only(self) -> "ReportContent":
        content = " ".join(
            item
            for field in self.__class__.model_fields
            for item in (getattr(self, field) if isinstance(getattr(self, field), list) else [getattr(self, field)])
        )
        if NUMERIC_EVALUATION_PATTERN.search(content):
            raise ValueError("Report content must not contain numeric evaluation results")
        if AI_ATTRIBUTION_PATTERN.search(content):
            raise ValueError("Report content must not include AI attribution")
        if any(not re.match(r"^(?:High Priority|Medium Priority|Good to Maintain):\s+\S", item, re.IGNORECASE) for item in self.priorityAreas):
            raise ValueError("Each priority area must use a qualitative priority level")
        return self


class GeminiReportSchema(ReportContent):
    # google-genai 1.75.0's response_schema converter sends additionalProperties
    # as additional_properties, which Gemini rejects. Keep the same fields and
    # constraints while omitting that unsupported schema keyword; generated
    # output is still validated strictly against ReportContent below.
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


SchemaFieldType = Literal["score", "boolean", "text", "question", "feedback", "single_select", "multi_select", "group"]


class EvaluationSchemaField(StrictModel):
    id: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,49}$")
    type: SchemaFieldType
    label: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)
    rationale: str = Field(default="", max_length=400)
    required: bool
    maxMarks: float | None = Field(default=None, gt=0, le=10000)
    weight: float | None = Field(default=None, ge=0, le=100)
    options: list[Annotated[str, Field(min_length=1, max_length=120)]] | None = Field(default=None, max_length=30)
    children: list["EvaluationSchemaField"] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.type == "score":
            if self.maxMarks is None or self.weight is None:
                raise ValueError("Score fields require maxMarks and weight")
            if self.options is not None or self.children is not None:
                raise ValueError("Score fields cannot have options or children")
        elif self.type in ("single_select", "multi_select"):
            if self.options is None or len(self.options) < 2:
                raise ValueError("Select fields need at least two options")
            if len({option.casefold() for option in self.options}) != len(self.options):
                raise ValueError("Select options must be unique")
            if self.maxMarks is not None or self.weight is not None or self.children is not None:
                raise ValueError("Select fields cannot have score values or children")
        elif self.type == "group":
            if not self.children:
                raise ValueError("Groups need child fields")
            self.required = False
            if self.maxMarks is not None or self.weight is not None or self.options is not None:
                raise ValueError("Groups cannot have score values or options")
        elif self.maxMarks is not None or self.weight is not None or self.options is not None or self.children is not None:
            raise ValueError("This field type cannot have score values, options, or children")
        return self


class EvaluationSchemaSection(StrictModel):
    id: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,49}$")
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)
    fields: list[EvaluationSchemaField] = Field(min_length=1, max_length=100)


class EvaluationSchema(StrictModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)
    sections: list[EvaluationSchemaSection] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_structure(self):
        ids: set[str] = set()
        section_names: set[str] = set()
        score_weights: list[float] = []
        count = 0

        def visit(field: EvaluationSchemaField, depth: int):
            nonlocal count
            count += 1
            if count > 100:
                raise ValueError("Schema may contain at most 100 fields")
            if depth > 4:
                raise ValueError("Schema nesting may not exceed four levels")
            if field.id in ids:
                raise ValueError("Schema field ids must be unique")
            ids.add(field.id)
            if field.type == "score":
                score_weights.append(float(field.weight))
            for child in field.children or []:
                visit(child, depth + 1)

        def validate_sibling_names(fields: list[EvaluationSchemaField], path: str):
            names: set[str] = set()
            for field in fields:
                name = field.label.casefold()
                if name in names:
                    raise ValueError(f"Duplicate field name at {path}")
                names.add(name)
                if field.type == "group":
                    validate_sibling_names(field.children or [], f"{path} / {field.label}")

        for section in self.sections:
            if section.id in ids:
                raise ValueError("Schema section and field ids must be unique")
            ids.add(section.id)
            section_name = section.name.casefold()
            if section_name in section_names:
                raise ValueError("Schema section names must be unique")
            section_names.add(section_name)
            validate_sibling_names(section.fields, section.name)
            for field in section.fields:
                visit(field, 1)
        if score_weights and abs(sum(score_weights) - 100) > 0.01:
            raise ValueError("Numeric score field weights must total 100")
        return self


class EvaluationSchemaRequest(StrictModel):
    prompt: str = Field(min_length=10, max_length=5000)
    eventName: str = Field(min_length=1, max_length=200)
    eventType: str = Field(min_length=1, max_length=100)
    eventDescription: str = Field(default="", max_length=5000)
    evaluationModel: EvaluationType | None = None
    existingCriteria: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(default_factory=list, max_length=100)
    existingConfiguration: dict[str, object] = Field(default_factory=dict)


class EmailDraftRequest(StrictModel):
    prompt: str = Field(min_length=5, max_length=2000)
    eventName: str = Field(min_length=1, max_length=200)
    eventType: str = Field(min_length=1, max_length=100)
    eventDescription: str = Field(default="", max_length=5000)


class AnnouncementEmailDraftRequest(EmailDraftRequest):
    audienceType: Literal["judges", "teams"]


class EmailDraft(StrictModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=8000)


class GeminiEmailDraft(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    subject: str
    body: str


class EmailDraftGenerateResponse(StrictModel):
    emailDraft: EmailDraft
    model: str
    promptVersion: str


class GeminiEvaluationSchemaField(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    id: str
    type: SchemaFieldType
    label: str
    description: str = ""
    rationale: str = ""
    required: bool
    maxMarks: float | None = None
    weight: float | None = None
    options: list[str] | None = None
    children: list["GeminiEvaluationSchemaField"] | None = None


class GeminiEvaluationSchemaSection(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    id: str
    name: str
    description: str = ""
    fields: list[GeminiEvaluationSchemaField]


class GeminiEvaluationSchema(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str
    description: str = ""
    sections: list[GeminiEvaluationSchemaSection]


class EvaluationSchemaGenerateResponse(StrictModel):
    evaluationSchema: EvaluationSchema
    model: str
    promptVersion: str


class GenerateResponse(StrictModel):
    report: ReportContent
    model: str
    promptVersion: str


class ProviderConfigurationError(Exception):
    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


class ProviderResponseError(Exception):
    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


def _safe_provider_error(error: Exception) -> None:
    provider_code = getattr(error, "code", None)
    provider_type = getattr(error, "type", None)
    safe_code = provider_code if isinstance(provider_code, str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,60}", provider_code) else "unknown"
    safe_type = provider_type if isinstance(provider_type, str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,60}", provider_type) else "unknown"
    logger.warning(
        "LLM report request failed (exception=%s, status=%s, provider_code=%s, provider_type=%s)",
        type(error).__name__,
        getattr(error, "status_code", getattr(error, "code", None)),
        safe_code,
        safe_type,
    )


async def _generate_with_openai(data: ReportRequest) -> tuple[ReportContent, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("missing_api_key", "OPENAI_API_KEY is not configured")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    try:
        client = AsyncOpenAI(api_key=api_key, timeout=45.0, max_retries=1)
        response = await client.responses.parse(
            model=model,
            input=build_messages(data.model_dump()),
            text_format=RawReportContent,
        )
    except Exception as error:
        _safe_provider_error(error)
        raise ProviderResponseError("provider_error", "The language model request failed") from error
    if response.output_parsed is None:
        raise ProviderResponseError("malformed_response", "The language model returned no structured report")
    return _sanitize_report_content(response.output_parsed), model


async def _generate_with_gemini(data: ReportRequest) -> tuple[ReportContent, str]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("missing_api_key", "GEMINI_API_KEY is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
    messages = build_messages(data.model_dump())
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=messages[1]["content"],
            config=types.GenerateContentConfig(
                system_instruction=messages[0]["content"],
                response_mime_type="application/json",
                response_schema=GeminiReportSchema,
            ),
        )
    except Exception as error:
        _safe_provider_error(error)
        code, reason = _classify_gemini_error(error)
        raise ProviderResponseError(code, reason) from error
    finally:
        await client.aio.aclose()
    try:
        if not response.text:
            raise ValueError("Empty structured response")
        return _sanitize_report_content(RawReportContent.model_validate_json(response.text)), model
    except ValidationError as error:
        issues = [
            {"field": ".".join(str(part) for part in issue["loc"]), "type": issue["type"], "message": issue["msg"]}
            for issue in error.errors(include_input=False, include_context=False, include_url=False)
        ]
        logger.warning("Gemini structured report failed validation (issues=%s)", issues)
        raise ProviderResponseError("malformed_response", "Gemini returned a malformed structured report") from error
    except (ValueError, TypeError) as error:
        raise ProviderResponseError("malformed_response", "Gemini returned a malformed structured report") from error


def _sanitize_report_content(raw: ReportContentFields) -> ReportContent:
    def clean_text(value: str) -> str:
        safe_sentences = [
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+|\n+", value)
            if sentence.strip()
            and not NUMERIC_EVALUATION_PATTERN.search(sentence)
            and not AI_ATTRIBUTION_PATTERN.search(sentence)
        ]
        return " ".join(safe_sentences).strip()

    cleaned: dict[str, object] = {}
    for field in ReportContent.model_fields:
        value = getattr(raw, field)
        if isinstance(value, list):
            cleaned[field] = [clean_text(item) for item in value if clean_text(item)]
        else:
            cleaned[field] = clean_text(value)
    try:
        return ReportContent.model_validate(cleaned)
    except ValidationError as error:
        raise ProviderResponseError("malformed_response", "The language model report could not be made safely qualitative") from error


def _classify_gemini_error(error: Exception) -> tuple[str, str]:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    code = getattr(error, "code", None)
    message = str(error).lower()
    if status == 401 or status == 403 or "api key" in message or "unauthenticated" in message or "permission denied" in message:
        return "invalid_api_key", "Gemini rejected the configured API key"
    if status == 429 or "quota" in message or "rate limit" in message or "resource_exhausted" in message:
        return "quota_exhausted", "Gemini quota exhausted or rate limit reached"
    if status == 404 or "model" in message and ("not found" in message or "unavailable" in message):
        return "model_unavailable", "The configured Gemini model is unavailable"
    if isinstance(error, TimeoutError) or "timeout" in message or "timed out" in message:
        return "timeout", "The Gemini request timed out"
    if isinstance(error, (ConnectionError, OSError)) or "network" in message or "connection" in message:
        return "network_error", "Could not connect to Gemini"
    if isinstance(code, int) and code == 429:
        return "quota_exhausted", "Gemini quota exhausted or rate limit reached"
    return "provider_error", "Gemini could not complete the report request"


async def generate_report(data: ReportRequest) -> tuple[ReportContent, str]:
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return await _generate_with_gemini(data)
    if provider == "openai":
        return await _generate_with_openai(data)
    raise ProviderConfigurationError("LLM_PROVIDER must be gemini or openai")


async def _generate_schema_with_openai(data: EvaluationSchemaRequest, *, repair_attempt: bool = False) -> tuple[EvaluationSchema, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("missing_api_key", "OPENAI_API_KEY is not configured")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    try:
        client = AsyncOpenAI(api_key=api_key, timeout=45.0, max_retries=1)
        response = await client.responses.parse(
            model=model,
            input=build_evaluation_schema_messages(data.model_dump(), repair_attempt=repair_attempt),
            text_format=EvaluationSchema,
        )
    except Exception as error:
        _safe_provider_error(error)
        raise ProviderResponseError("provider_error", "The language model request failed") from error
    if response.output_parsed is None:
        raise ProviderResponseError("malformed_response", "The language model returned no evaluation schema")
    try:
        return EvaluationSchema.model_validate(response.output_parsed.model_dump()), model
    except ValidationError as error:
        raise ProviderResponseError("malformed_response", "The language model returned an invalid evaluation schema") from error


async def _generate_schema_with_gemini(data: EvaluationSchemaRequest, *, repair_attempt: bool = False) -> tuple[EvaluationSchema, str]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("missing_api_key", "GEMINI_API_KEY is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
    messages = build_evaluation_schema_messages(data.model_dump(), repair_attempt=repair_attempt)
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=messages[1]["content"],
            config=types.GenerateContentConfig(
                system_instruction=messages[0]["content"],
                response_mime_type="application/json",
                response_schema=GeminiEvaluationSchema,
            ),
        )
    except Exception as error:
        _safe_provider_error(error)
        code, reason = _classify_gemini_error(error)
        raise ProviderResponseError(code, reason) from error
    finally:
        await client.aio.aclose()
    try:
        if not response.text:
            raise ValueError("Empty structured response")
        schema = EvaluationSchema.model_validate_json(response.text)
    except ValidationError as error:
        issues = [
            {"field": ".".join(str(part) for part in issue["loc"]), "type": issue["type"], "message": issue["msg"]}
            for issue in error.errors(include_input=False, include_context=False, include_url=False)
        ]
        logger.warning("Gemini evaluation schema failed validation (issues=%s)", issues)
        raise ProviderResponseError("malformed_response", "Gemini returned an invalid evaluation schema") from error
    except (ValueError, TypeError) as error:
        raise ProviderResponseError("malformed_response", "Gemini returned an invalid evaluation schema") from error

    return schema, model


def _remove_existing_schema_criteria(schema: EvaluationSchema, data: EvaluationSchemaRequest) -> EvaluationSchema:
    existing = {item.strip().casefold() for item in data.existingCriteria}
    if not existing:
        return schema
    payload = schema.model_dump()

    def remove_duplicates(fields):
        kept = []
        for field in fields:
            if field["label"].strip().casefold() in existing:
                continue
            if field["type"] == "group":
                field["children"] = remove_duplicates(field.get("children") or [])
                if not field["children"]:
                    continue
            kept.append(field)
        return kept

    for section in payload["sections"]:
        section["fields"] = remove_duplicates(section["fields"])
    payload["sections"] = [
        section for section in payload["sections"]
        if section["fields"] and section["name"].strip().casefold() not in existing
    ]
    score_fields = []

    def collect_scores(fields):
        for field in fields:
            if field["type"] == "score":
                score_fields.append(field)
            elif field["type"] == "group":
                collect_scores(field.get("children") or [])

    for section in payload["sections"]:
        collect_scores(section["fields"])
    if score_fields:
        total_weight = sum(float(field["weight"] or 0) for field in score_fields)
        if total_weight <= 0:
            for field in score_fields:
                field["weight"] = round(100 / len(score_fields), 2)
        else:
            for field in score_fields:
                field["weight"] = round(float(field["weight"]) * 100 / total_weight, 2)
        score_fields[-1]["weight"] = round(100 - sum(float(field["weight"]) for field in score_fields[:-1]), 2)
    try:
        return EvaluationSchema.model_validate(payload)
    except ValidationError as error:
        raise ProviderResponseError("malformed_response", "The model returned no valid additional criteria") from error


async def generate_evaluation_schema(data: EvaluationSchemaRequest) -> tuple[EvaluationSchema, str]:
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    for repair_attempt in (False, True):
        try:
            if provider == "gemini":
                schema, model = await _generate_schema_with_gemini(data, repair_attempt=repair_attempt)
            elif provider == "openai":
                schema, model = await _generate_schema_with_openai(data, repair_attempt=repair_attempt)
            else:
                raise ProviderConfigurationError("invalid_provider", "LLM_PROVIDER must be gemini or openai")
            return _remove_existing_schema_criteria(schema, data), model
        except ProviderResponseError as error:
            if not repair_attempt and error.code == "malformed_response":
                logger.info("Retrying malformed evaluation schema once with validation guidance")
                continue
            raise
    raise ProviderResponseError("malformed_response", "The model returned an invalid evaluation schema")


async def generate_email_draft(messages: list[dict[str, str]]) -> tuple[EmailDraft, str]:
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ProviderConfigurationError("missing_api_key", "OPENAI_API_KEY is not configured")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        try:
            client = AsyncOpenAI(api_key=api_key, timeout=45.0, max_retries=1)
            response = await client.responses.parse(model=model, input=messages, text_format=EmailDraft)
        except Exception as error:
            _safe_provider_error(error)
            raise ProviderResponseError("provider_error", "The language model request failed") from error
        if response.output_parsed is None:
            raise ProviderResponseError("malformed_response", "The language model returned no email draft")
        try:
            return EmailDraft.model_validate(response.output_parsed.model_dump()), model
        except ValidationError as error:
            raise ProviderResponseError("malformed_response", "The language model returned an invalid email draft") from error

    if provider != "gemini":
        raise ProviderConfigurationError("invalid_provider", "LLM_PROVIDER must be gemini or openai")
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("missing_api_key", "GEMINI_API_KEY is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=messages[1]["content"],
            config=types.GenerateContentConfig(
                system_instruction=messages[0]["content"],
                response_mime_type="application/json",
                response_schema=GeminiEmailDraft,
            ),
        )
    except Exception as error:
        _safe_provider_error(error)
        code, reason = _classify_gemini_error(error)
        raise ProviderResponseError(code, reason) from error
    finally:
        await client.aio.aclose()
    try:
        if not response.text:
            raise ValueError("Empty structured response")
        return EmailDraft.model_validate_json(response.text), model
    except ValidationError as error:
        raise ProviderResponseError("malformed_response", "Gemini returned an invalid email draft") from error
    except (ValueError, TypeError) as error:
        raise ProviderResponseError("malformed_response", "Gemini returned an invalid email draft") from error


async def generate_announcement_email_draft(data: AnnouncementEmailDraftRequest) -> tuple[EmailDraft, str]:
    messages = build_announcement_email_messages(data.model_dump())
    return await generate_email_draft(messages)


async def generate_judge_invitation_email_draft(data: EmailDraftRequest) -> tuple[EmailDraft, str]:
    messages = build_judge_invitation_email_messages(data.model_dump())
    return await generate_email_draft(messages)


app = FastAPI(title="ScoreFlow AI Result Reports", version="1.0.0")


@app.get("/health")
async def health():
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return {
            "status": "ok",
            "provider": "gemini",
            "model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite",
            "configured": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        }
    return {"status": "ok", "provider": provider, "configured": bool(os.getenv("OPENAI_API_KEY", "").strip())}


@app.post("/reports/generate", response_model=GenerateResponse)
async def create_report(request: ReportRequest):
    try:
        report, model = await generate_report(request)
    except ProviderConfigurationError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=503, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    except ProviderResponseError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=502, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    return GenerateResponse(report=report, model=model, promptVersion=PROMPT_VERSION)


@app.post("/evaluation-schema/generate", response_model=EvaluationSchemaGenerateResponse)
async def create_evaluation_schema(request: EvaluationSchemaRequest):
    try:
        schema, model = await generate_evaluation_schema(request)
    except ProviderConfigurationError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=503, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    except ProviderResponseError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=502, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    return EvaluationSchemaGenerateResponse(evaluationSchema=schema, model=model, promptVersion="evaluation-schema-v1")


async def _email_draft_response(generator, request, prompt_version: str) -> EmailDraftGenerateResponse:
    try:
        draft, model = await generator(request)
    except ProviderConfigurationError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=503, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    except ProviderResponseError as error:
        provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        raise HTTPException(status_code=502, detail={"provider": provider, "code": error.code, "reason": error.reason}) from error
    return EmailDraftGenerateResponse(emailDraft=draft, model=model, promptVersion=prompt_version)


@app.post("/emails/announcements/generate", response_model=EmailDraftGenerateResponse)
async def create_announcement_email_draft(request: AnnouncementEmailDraftRequest):
    return await _email_draft_response(generate_announcement_email_draft, request, "announcement-email-v1")


@app.post("/emails/judge-invitations/generate", response_model=EmailDraftGenerateResponse)
async def create_judge_invitation_email_draft(request: EmailDraftRequest):
    return await _email_draft_response(generate_judge_invitation_email_draft, request, "judge-invitation-email-v1")
