# Secure deployment configuration

ScoreFlow now has separate organizer and judge sign-in. Before deployment, configure the environment in the Node API and AI service; never commit populated `.env` files.

## Node API variables

Copy `server/.env.example` to the server's private environment configuration and set:

- `MONGODB_URI`: production MongoDB connection string with a least-privilege database user.
- `NODE_ENV=production` and `PORT`.
- `CLIENT_URL`: canonical public frontend URL used in invitation links.
- `CLIENT_ORIGINS`: comma-separated exact browser origins allowed by CORS.
- `ORGANIZER_EMAIL_ALLOWLIST`: one or more comma-separated authorized organizer email addresses. Only these addresses can begin organizer signup.

Legacy events without an `ownerId` stay stored and are inaccessible to organizers until assigned. After the authorized organizer account exists, run from `server/` to preview the approved legacy mapping: `node scripts/migrateEventOwners.js satmis2024@gmail.com`. Add `--apply` only when ready to write; it assigns only currently unowned events. The script never changes event or related records.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: independent random secrets of at least 32 bytes.
- `AI_SERVICE_URL` and `AI_SERVICE_SHARED_SECRET`: private AI service URL and the shared secret also configured on FastAPI.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`.
- `LLM_PROVIDER` and its provider key/model (`GEMINI_API_KEY`/`GEMINI_MODEL` or `OPENAI_API_KEY`/`OPENAI_MODEL`).

Generate each random secret independently, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Restrict access to the values in the deployment secret manager.

Organizers enter their name, allowlisted email, and password on `/signup`. The form checks a 12-character minimum, mixed-case letters, and a number; the backend hashes the password with bcrypt and stores it only on a pending registration. Configure Brevo's API v3 key, sender email, and the public `CLIENT_URL`; the API sends a single-use email verification link that expires after 30 minutes. Opening the link activates the account and redirects to login. Pending registrations and hashed verification tokens expire automatically. No setup secret is sent to the browser. There is no password-reset endpoint.

## AI service variables

Copy `ai-service/.env.example` into the AI service's private environment. Set `AI_SERVICE_SHARED_SECRET` to the exact same random value as the Node API. Keep the AI service on a private network where possible. Its generation endpoints reject requests without the matching `X-ScoreFlow-Service-Token`; `/health` is the only unauthenticated endpoint.

## Authentication and access

Organizer passwords and judge passwords are bcrypt hashed. Organizer identities must be in the environment allowlist. Judges receive invitation-scoped access by accepting a valid, unexpired invitation. Access tokens last ten minutes and remain in frontend memory. Refresh tokens are random, stored as keyed hashes in MongoDB, rotated on use, and sent only in HttpOnly, SameSite=Strict cookies. Logout revokes all refresh sessions for that account and invalidates access tokens.

The API requires organizer authentication for event creation/listing/changes, team mutations, judge management and invitations, evaluation configuration writes, announcements, results, result reports, analytics, email generation and report delivery. Judges can read only their event, their assigned teams, event evaluation configuration, and their own evaluations. Evaluation submissions replace the submitted judge ID with the authenticated identity after verifying the event and team assignment. Judge invitation preview and acceptance, organizer signup and email verification, login, refresh, logout, and health are the intentionally public endpoints.

## Deployment constraints

- Serve the frontend and API over HTTPS. The refresh cookie uses `Secure` in production and assumes frontend and API are same-site so `SameSite=Strict` works.
- `CLIENT_ORIGINS` must list each exact production frontend origin. The API fails startup in production when required secrets or deployment settings are missing.
- Login and invitation throttles are in-memory per Node process. Use a shared rate-limit store before horizontally scaling the API.
- MongoDB must use TLS and network access controls. Keep the FastAPI service private and do not expose provider keys to the browser.
- Email metrics record successful sends reported by the configured email service. They do not confirm inbox delivery.
