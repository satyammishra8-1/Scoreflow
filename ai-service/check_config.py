import os
from dotenv import load_dotenv

load_dotenv()

print("Provider:", os.getenv("LLM_PROVIDER"))
print("Model:", os.getenv("GEMINI_MODEL"))
print("API key configured:", bool(os.getenv("GEMINI_API_KEY")))