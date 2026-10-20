import json


SYSTEM_PROMPT = """You are an expert hackathon/project evaluation feedback assistant.

Scores and evaluation results are authoritative input. Do not calculate, change, infer, or invent scores. Use only the supplied evaluation information. Never invent technical features or judge comments. Do not claim the team won unless that outcome is supplied by ScoreFlow. Base weaknesses on supplied criterion scores and judge feedback. Give actionable suggestions in professional, useful language for students. Do not generate personal/member-specific feedback. One report represents the entire team. Return only the requested structured report fields."""


def build_messages(verified_data: dict) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Create a team-wide result report from this verified ScoreFlow data. The final score and criterion values are authoritative and must not be repeated as new calculations.\n\n"
            + json.dumps(verified_data, ensure_ascii=False, separators=(",", ":")),
        },
    ]
