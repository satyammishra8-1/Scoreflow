# Secure deployment configuration

ScoreFlow now has separate organizer and judge sign-in. Before deployment, configure the environment in the Node API and AI service; never commit populated `.env` files.

## Node API variables

Set server variables in Render's service environment settings. Set `VITE_API_URL` in Vercel's build environment before building the frontend. Keep every real key and connection string in those environment settings; never commit populated `.env` files.

- `MONGODB_URI`: production MongoDB connection string with a least-privilege database user.
- Include the intended database name in the URI path (for example, `mongodb+srv://.../scoreflow?retryWrites=true`). Startup rejects URIs with no explicit database name because Mongoose otherwise defaults to `test`. Local development can use a named local database such as `scoreflow`; production must use TLS.
- `NODE_ENV=production` and `PORT`.
- `CLIENT_URL`: canonical public frontend HTTPS origin used in invitation links (no path, query, or fragment).
- `CLIENT_ORIGINS`: comma-separated exact HTTPS browser origins allowed by CORS, with no paths or trailing slashes.
- `VITE_API_URL`: public API base URL embedded in the frontend build. Use `/api` behind a same-origin reverse proxy, or the full HTTPS API URL.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: independent random secrets of at least 32 bytes.
- `AI_SERVICE_URL` and `AI_SERVICE_SHARED_SECRET`: private AI service URL and the shared secret also configured on FastAPI. Use an internal service URL where the platform supports private networking.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and optional `BREVO_SENDER_NAME`. Configure the Brevo sender identity and key in Render; do not place provider credentials in Vercel or browser variables.
- `LLM_PROVIDER` and its provider key/model (`GEMINI_API_KEY`/`GEMINI_MODEL` or `OPENAI_API_KEY`/`OPENAI_MODEL`).

Legacy events without an `ownerId` stay stored and are inaccessible to organizers until assigned. After the organizer account exists, run from `server/` to preview the legacy mapping: `node scripts/migrateEventOwners.js organizer@example.com`. Add `--apply` only after reviewing the preview; it assigns only currently unowned events. The script never changes event or related records.

Generate the JWT and AI shared secrets independently, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Production startup requires distinct JWT secrets of at least 32 bytes and all service/provider settings. This repository does not configure external Render, Vercel, MongoDB, AI provider, or Brevo accounts; add their real values in each service's environment settings.

Organizers enter their name, email, and password on `/signup`. The form checks a minimum of eight characters and password confirmation; the backend normalizes email, hashes the password with bcrypt, creates the account, and establishes a secure session immediately. No setup secret is sent to the browser. There is no password-reset endpoint.

## AI service variables

Copy `ai-service/.env.example` into the AI service's private environment. Set `AI_SERVICE_SHARED_SECRET` to the exact same random value as the Node API. Keep the AI service on a private network where possible. Its generation endpoints reject requests without the matching `X-ScoreFlow-Service-Token`; `/health` is the only unauthenticated endpoint.

## Authentication and access

Organizer passwords and judge passwords are bcrypt hashed. Judges receive invitation-scoped access by accepting a valid, unexpired invitation. Access tokens last ten minutes and remain in frontend memory. Refresh tokens are random, stored as keyed hashes in MongoDB, rotated on use, and sent only in HttpOnly, SameSite=Strict cookies. Logout revokes all refresh sessions for that account and invalidates access tokens.

The API requires organizer authentication for event creation/listing/changes, team mutations, judge management and invitations, evaluation configuration writes, announcements, results, result reports, analytics, email generation and report delivery. Judges can read only their event, their assigned teams, event evaluation configuration, and their own evaluations. Evaluation submissions replace the submitted judge ID with the authenticated identity after verifying the event and team assignment. Judge invitation preview and acceptance, organizer signup, login, refresh, logout, and health are the intentionally public endpoints.

## Deployment constraints

- Serve the frontend and API over HTTPS. The refresh cookie uses `Secure` in production and assumes frontend and API are same-site so `SameSite=Strict` works.
- `CLIENT_ORIGINS` must list each exact production frontend origin. The API fails startup in production when required secrets or deployment settings are missing.
- Login and invitation throttles are in-memory per Node process. Use a shared rate-limit store before horizontally scaling the API.
- MongoDB must use TLS and network access controls. Keep the FastAPI service private and do not expose provider keys to the browser.
- Email metrics record successful sends reported by the configured email service. They do not confirm inbox delivery.
