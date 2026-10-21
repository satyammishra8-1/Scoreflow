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

from prompts import build_messages

load_dotenv()

PROMPT_VERSION = "result-report-v1"
logger = logging.getLogger("scoreflow.ai_service")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


EvaluationType = Literal[
    "criteria-based", "open-holistic", "remote-async", "live-demo", "ranking-voting", "custom"
]


class ObservationInput(StrictModel):
    area: str = Field(min_length=1, max_length=200)
    response: str = Field(min_length=1, max_length=4000)


class EvaluationInput(StrictModel):
    observations: list[ObservationInput] = Field(max_length=100)
    feedback: str = Field(max_length=4000)


class ReportRequest(StrictModel):
    eventName: str = Field(min_length=1, max_length=200)
    eventType: str = Field(min_length=1, max_length=100)
    teamName: str = Field(min_length=1, max_length=200)
    evaluationType: EvaluationType
    projectDescription: str = Field(max_length=4000)
    projectMaterials: list[str] = Field(max_length=100)
    evaluationAreas: list[str] = Field(max_length=100)
    evaluations: list[EvaluationInput] = Field(min_length=1, max_length=20)


class ReportContent(StrictModel):
    summary: str = Field(min_length=1, max_length=4000)
    strengths: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    weaknesses: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    improvementSuggestions: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    priorityAreas: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=5)
    judgeFeedbackSummary: str = Field(min_length=1, max_length=4000)
    finalRemarks: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def _validate_qualitative_only(self) -> "ReportContent":
        content = " ".join(
            item
            for field in self.__class__.model_fields
            for item in (getattr(self, field) if isinstance(getattr(self, field), list) else [getattr(self, field)])
        )
        if re.search(r"\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b", content, re.IGNORECASE):
            raise ValueError("Report content must not contain numeric evaluation results")
        return self


class GeminiReportSchema(ReportContent):
    # google-genai 1.75.0's response_schema converter sends additionalProperties
    # as additional_properties, which Gemini rejects. Keep the same fields and
    # constraints while omitting that unsupported schema keyword; generated
    # output is still validated strictly against ReportContent below.
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


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
            text_format=ReportContent,
        )
    except Exception as error:
        _safe_provider_error(error)
        raise ProviderResponseError("provider_error", "The language model request failed") from error
    if response.output_parsed is None:
        raise ProviderResponseError("malformed_response", "The language model returned no structured report")
    return response.output_parsed, model


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
        return ReportContent.model_validate_json(response.text), model
    except (ValidationError, ValueError, TypeError) as error:
        raise ProviderResponseError("malformed_response", "Gemini returned a malformed structured report") from error


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
