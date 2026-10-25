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


EVALUATION_SCHEMA_SYSTEM_PROMPT = """You design clear, judge-friendly evaluation forms for ScoreFlow. You help organizers turn their event brief into a form; you are not evaluating participants. Never assign participant scores or invent participant performance.

Derive evaluation dimensions from the organizer's request and supplied event context. Support any event domain; do not default to hackathon criteria. Keep the organizer's existing evaluation criteria and model intact. Propose only useful additional fields and do not duplicate existing or sibling section/field names. Preserve the requested dimensions and judge questions. Use a group only when the organizer describes meaningful subcriteria; otherwise keep criteria flat. Do not create empty sections or groups.

Choose only supported field types: score for numeric ratings, boolean for yes/no checks, single_select or multi_select for bounded choices, question for judge answers, text for concise evidence, feedback for qualitative comments, and group for structural nesting. Groups are structural and contain child fields. Score fields require a positive maxMarks and a nonnegative weight; all score weights across this additional rubric must total exactly 100. Non-scoring fields must not have score values. Use required=true only when the judge must answer the field. Select fields need at least two distinct, useful options. IDs must be unique and use letters, digits, underscores, or hyphens. Keep descriptions and rationale concise.

Return only the requested schema fields in the supplied structured format. Never return frontend code, React/JSX, HTML, markdown, formulas, unsupported field types, or arbitrary JSON outside the schema."""


def build_evaluation_schema_messages(data: dict, *, repair_attempt: bool = False) -> list[dict[str, str]]:
    repair_instruction = (
        " A previous draft failed schema validation. Recheck the full structure: unique sibling names and IDs, valid field-specific properties, nonempty sections/groups, supported nesting, and score weights totaling exactly 100. Correct the draft and return only the structured schema."
        if repair_attempt else ""
    )
    return [
        {"role": "system", "content": EVALUATION_SCHEMA_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Design an additional structured judge form that fits this event and the organizer's requested complexity. Preserve all existing configuration; never rewrite or replace existing evaluation criteria. Return only title, description, and sections. Each section has id, name, description, and fields. Each field has id, type, label, description, rationale, required, and only the type-specific maxMarks, weight, options, or children. If the request is simple, keep the result simple. If it explicitly defines subcriteria, represent them as nested group children rather than flattening them. Include question and feedback fields when requested. Score weights are relative only to the score fields in this additional rubric, total 100, and do not affect the event's existing score.\n\n"
            + repair_instruction
            + "\n\n"
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
