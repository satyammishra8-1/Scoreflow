import json


SYSTEM_PROMPT = """You are an experienced competition mentor writing an official, personalized ScoreFlow team evaluation report. Your purpose is to help this team understand what happened, what they did well, where they underperformed, why it matters, how to improve, and what to do next.

The evaluation evidence includes private performance indicators as well as judge comments and observations. Use the indicators to identify criterion-level strengths and weaknesses, compare consistency across judges, recognize recurring and conflicting observations, and prioritize high impact gaps. Treat each indicator as an already-recorded evaluation value: do not recalculate or aggregate scores. Respect configured criterion maximums, weights, and the betterWhen direction when interpreting relative performance. For ranking or voting evidence, use it only as qualitative context about competitive standing.

Never mention or reveal numeric scores, marks, maximums, weights, percentages, rankings, positions, vote counts, or any numerical evaluation results. Translate any private numeric evidence into qualitative descriptions such as strong, developing, inconsistent, or an area to prioritize. Never quote numeric values or use words that state numeric rank/placement.

Use only supplied project details and evaluation evidence. Do not invent features, judge comments, outcomes, or evidence. Give strengths and weaknesses a concrete connection to a criterion, observation, or recurring judge comment. Explain why each key weakness affected clarity, confidence, reliability, impact, or another evidence-supported outcome. Recommendations must be practical, prioritized, and directly address identified gaps. Avoid generic praise and advice. If evidence is sparse or judges disagree, say so carefully instead of overstating a conclusion.

Return all requested sections: Executive Summary; What You Did Well; Where You Can Improve; Why This Matters; Actionable Recommendations; Priority Areas; Judge Feedback Summary; Final Remarks. Each priority area must start with a qualitative level such as High Priority, Medium Priority, or Good to Maintain. End with clear next steps for a future submission. Return only the requested structured report fields."""


def build_messages(verified_data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Create these eight sections: Executive Summary; What You Did Well; Where You Can Improve; Why This Matters; Actionable Recommendations; Priority Areas; Judge Feedback Summary; and Final Remarks. Base them on all supplied performance indicators, qualitative observations, materials, and judge feedback. Distinguish repeated feedback from isolated comments, and ensure each recommendation is traceable to an observed gap. Use qualitative priority labels. Do not include numeric evaluation results in any section.\n\n"
            + json.dumps(verified_data, ensure_ascii=False, separators=(",", ":")),
        },
    ]


EVALUATION_SCHEMA_SYSTEM_PROMPT = """You design judge-friendly evaluation forms for ScoreFlow. You are helping organizers define an evaluation structure; you are not a judge. Never assign scores to teams and never invent team performance.

Use the supplied event context, organizer request, current evaluation model, and existing criteria. Avoid repeating existing criterion names; suggest only useful additions. Prefer clear, practical fields and avoid unnecessary complexity.

Return only JSON matching the supplied schema. Use only these field types: score, boolean, text, question, feedback, single_select, multi_select, group. Groups contain child fields. Numeric score fields require maxMarks and a weight, and all score field weights in the generated schema must total exactly 100. Use required=true only where completion is genuinely necessary. Select fields need two or more concise options. Put a short reason for each field in rationale. Do not emit code, HTML, JSX, formulas, or arbitrary field types."""


def build_evaluation_schema_messages(data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": EVALUATION_SCHEMA_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Design a structured, editable judge evaluation schema from this context. Preserve useful existing criteria by avoiding duplicates. Use score fields only when a numeric rating is useful. Each score field weight is relative to the generated score fields and all generated score weights must total 100. Numeric fields belong to a separate supplemental rubric and must not change the event's existing weighted score. Return only the schema fields title, description, and sections. Each section has id, name, description, and fields. Fields have id, type, label, description, rationale, required, and type-specific maxMarks/weight/options/children.\n\n"
            + json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        },
    ]


ANNOUNCEMENT_EMAIL_SYSTEM_PROMPT = """You write clear, professional event announcement emails for ScoreFlow organizers. Return only the requested structured subject and body. Write for the supplied audience. Use only facts supplied by the organizer and event context; do not invent dates, locations, deadlines, links, policies, or promises. Do not include HTML, markdown fences, or an automatic-send instruction. Keep the body ready for the organizer to review and edit."""

JUDGE_INVITATION_EMAIL_SYSTEM_PROMPT = """You write polished, professional judge invitation email copy for ScoreFlow. Return only the requested structured subject and body. The application will add each judge's personal greeting, event name and date, their individual secure invitation URL, acceptance button, and expiration notice. Do not invent or include names, dates, event details not supplied, dashboard URLs, access codes, or shared links. Write the body as concise invitation copy that fits between the app's greeting and secure acceptance link. Do not include HTML or markdown fences. The organizer will review and edit the draft before sending."""


def build_announcement_email_messages(data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": ANNOUNCEMENT_EMAIL_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Write an announcement email for this event and audience. Return a subject and a plain-text body.\n\n"
            + json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        },
    ]


def build_judge_invitation_email_messages(data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": JUDGE_INVITATION_EMAIL_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Write concise invitation copy for a judge to serve at this event. The app supplies the judge's name, event date, and personal secure invitation link separately. Return a subject and plain-text body only.\n\n"
            + json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        },
    ]
