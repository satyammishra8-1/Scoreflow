import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model=model,
        contents="Reply with exactly: Gemini connection successful"
    )

    print("SUCCESS!")
    print("Response:", response.text)

except Exception as error:
    print("GEMINI TEST FAILED")
    print("Error type:", type(error).__name__)
    print("Error:", str(error))

finally:
    client.close()