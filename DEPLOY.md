# Deploy Anchor (Vercel site + EU Firebase + Cloud Run API)

## Credentials policy (ADC, not API keys)

This org disallows **Google Cloud API keys**. Prefer **Application Default Credentials**:

```bash
# once per machine
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
```

- **Nest / Firebase Admin / Cloud Run:** use ADC (runtime service account on Cloud Run; ADC locally).
- **Do not** create Cloud Console “API keys” for the backend.
- `GOOGLE_APPLICATION_CREDENTIALS` may point at a **service account JSON file** (IAM key file). That is not an API key, but many orgs also restrict downloading SA keys — prefer ADC login or Cloud Run’s attached service account.

## EU Firebase (accounts + sovereignty)

1. Create a Firebase project (update `.firebaserc`).
2. Enable **Authentication → Email/Password**.
3. Create **Firestore** in **`eur3` (Europe multi-region)**.
4. `firebase login` then `firebase deploy --only firestore:rules`
5. Register a **Web** app. Copy the Firebase SDK snippet into `apps/web/.env` as `PUBLIC_FIREBASE_*`.
   - The web snippet includes a browser `apiKey` field. That is Firebase’s client config (auto-provisioned with the web app), not a key you create under “APIs & Services → Credentials”. If your org blocks even those, ask IT for an exception for Firebase Web apps, or we cannot run client Auth in the browser.
6. Set `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` on the API (no API key).
7. Production: `REQUIRE_AUTH=true` and `PUBLIC_REQUIRE_AUTH=true`.

## Gemini

Current code uses the **Gemini Developer API** (`GEMINI_API_KEY` header). If that is also blocked by the same org policy, we must move to **Vertex AI + ADC** (breaking change vs the hackathon “Developer API” choice). Say if you want that switch.

Until then:

```bash
GEMINI_DATA_REGION_NOTE=developer-api-global
```

## Vercel (website)

Root directory: `apps/web`. Function region: **Frankfurt (`fra1`)**. Set `PUBLIC_FIREBASE_*` and `PUBLIC_PRIVACY_EMAIL=privacy@anchor.com`.

## Cloud Run API (ADC / service account)

```bash
pnpm build:api
gcloud run deploy anchor-api \
  --source . \
  --dockerfile apps/api/Dockerfile \
  --region europe-west1 \
  --allow-unauthenticated \
  --service-account=anchor-api@YOUR_PROJECT.iam.gserviceaccount.com \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=YOUR_PROJECT,FIREBASE_PROJECT_ID=YOUR_PROJECT,REQUIRE_AUTH=true,GEMINI_DATA_REGION_NOTE=developer-api-global,PUBLIC_URL=https://YOUR_HOST
```

Grant that service account Firebase Admin / Datastore User (or Firebase Admin SDK Administrator Service Agent) — no API keys.

## Local development

```bash
gcloud auth application-default login
# apps/web/.env from apps/web/.env.example (Firebase web snippet)
# apps/api/.env.local: FIREBASE_PROJECT_ID=...  (no service-account JSON required if ADC works)
pnpm dev:api
pnpm dev:web
```
