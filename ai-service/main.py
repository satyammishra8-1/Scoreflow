import os
import logging
import re
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import AsyncOpenAI
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from prompts import build_messages

load_dotenv()

PROMPT_VERSION = "result-report-v1"
logger = logging.getLogger("scoreflow.ai_service")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CriterionInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    maximumMarks: float = Field(gt=0)
    weight: float = Field(ge=0)
    judgeScores: list[float] = Field(max_length=20)
    averageScore: float | None


class EvaluationInput(StrictModel):
    judgeName: str = Field(min_length=1, max_length=100)
    status: str = Field(min_length=1, max_length=30)
    criteriaScores: list[dict[str, str | float | None]] = Field(max_length=100)
    feedback: str = Field(max_length=4000)


class ReportRequest(StrictModel):
    eventName: str = Field(min_length=1, max_length=200)
    eventType: str = Field(min_length=1, max_length=100)
    teamName: str = Field(min_length=1, max_length=200)
    teamNumber: str = Field(min_length=1, max_length=40)
    finalScore: float = Field(ge=0, le=100)
    scoreMaximum: float = Field(gt=0, le=1000)
    criteria: list[CriterionInput] = Field(max_length=100)
    evaluations: list[EvaluationInput] = Field(min_length=1, max_length=20)
    evaluationStatus: str = Field(min_length=1, max_length=30)


class ReportContent(StrictModel):
    summary: str = Field(min_length=1, max_length=4000)
    strengths: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    weaknesses: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    improvementSuggestions: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=8)
    priorityAreas: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=1, max_length=5)
    judgeFeedbackSummary: str = Field(min_length=1, max_length=4000)
    finalRemarks: str = Field(min_length=1, max_length=4000)


class GenerateResponse(StrictModel):
    report: ReportContent
    model: str
    promptVersion: str


class ProviderConfigurationError(Exception):
    pass


class ProviderResponseError(Exception):
    pass


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
        raise ProviderConfigurationError("OPENAI_API_KEY is not configured")
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
        raise ProviderResponseError("The language model request failed") from error
    if response.output_parsed is None:
        raise ProviderResponseError("The language model returned no structured report")
    return response.output_parsed, model


async def _generate_with_gemini(data: ReportRequest) -> tuple[ReportContent, str]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ProviderConfigurationError("GEMINI_API_KEY is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    messages = build_messages(data.model_dump())
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=messages[1]["content"],
            config=types.GenerateContentConfig(
                system_instruction=messages[0]["content"],
                response_mime_type="application/json",
                response_schema=_gemini_report_schema(),
            ),
        )
    except Exception as error:
        _safe_provider_error(error)
        raise ProviderResponseError("The language model request failed") from error
    finally:
        await client.aio.aclose()
    try:
        if not response.text:
            raise ValueError("Empty structured response")
        return ReportContent.model_validate_json(response.text), model
    except (ValidationError, ValueError, TypeError) as error:
        raise ProviderResponseError("The language model returned no valid structured report") from error


def _gemini_report_schema() -> dict:
    # Gemini's response schema does not accept JSON Schema's additionalProperties.
    schema = ReportContent.model_json_schema()
    schema.pop("additionalProperties", None)
    return schema


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
    return {"status": "ok"}


@app.post("/reports/generate", response_model=GenerateResponse)
async def create_report(request: ReportRequest):
    try:
        report, model = await generate_report(request)
    except ProviderConfigurationError as error:
        raise HTTPException(status_code=503, detail="AI provider is not configured") from error
    except ProviderResponseError as error:
        raise HTTPException(status_code=502, detail="AI report generation failed") from error
    return GenerateResponse(report=report, model=model, promptVersion=PROMPT_VERSION)
