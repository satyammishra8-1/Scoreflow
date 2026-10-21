# ScoreFlow AI Result Reports

This stateless FastAPI service accepts verified team evaluation data from the Node API and returns a Pydantic-validated report. It does not connect to MongoDB and does not calculate or write scores.

## Local setup

Use Python 3.12 or newer. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

The development provider is Gemini. Set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-3.5-flash-lite` in `ai-service/.env`. The service requests JSON matching the existing Pydantic report schema and validates the returned content before responding. `/health` reports the selected provider, model, and whether its key is configured without calling the provider.

The existing OpenAI implementation remains available by setting `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` (default `gpt-4o-mini`). Start the service with:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Configure the Node backend with `AI_SERVICE_URL=http://localhost:8000`. The organizer UI only calls the Node API.

Run its mocked provider tests with `python -m unittest discover -s tests -v`.
