import json


SYSTEM_PROMPT = """You are generating a team-facing evaluation report. Never mention or reveal numeric scores, marks, weights, percentages, rankings, positions, vote counts, or numerical evaluation results. Convert evaluation evidence into professional qualitative insights.

Use only the supplied project description, evaluation areas, materials, qualitative observations, and judge feedback. Do not invent technical features, judge comments, outcomes, or evidence. Address the whole team professionally and constructively. Make recommendations specific and actionable, grounded in the available evidence. Return only the requested structured report fields."""


def build_messages(verified_data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Create a professional team-wide evaluation report from this qualitative ScoreFlow evidence. Use these sections: Executive Summary, Key Strengths, Areas for Improvement, Actionable Recommendations, Judge Feedback Summary, and Final Remarks. Do not include numerical evaluation results.\n\n"
            + json.dumps(verified_data, ensure_ascii=False, separators=(",", ":")),
        },
    ]
