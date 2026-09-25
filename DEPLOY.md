# Deploy Anchor on Google (Firebase Hosting + Cloud Run)

## One-time setup

1. Create a Firebase / GCP project (replace `anchor-openconf` in `.firebaserc`).
2. Enable **Cloud Run** and **Firebase Hosting**.
3. Install CLIs: `npm i -g firebase-tools` and ensure `gcloud` is authenticated.
4. `firebase login` and `gcloud auth login`.

## Build & deploy API (Cloud Run)

```bash
pnpm build:api
gcloud run deploy anchor-api \
  --source . \
  --dockerfile apps/api/Dockerfile \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars=TWILIO_ACCOUNT_SID=...,PUBLIC_URL=https://YOUR_HOSTING_DOMAIN
```

Or build the image yourself:

```bash
docker build -f apps/api/Dockerfile -t REGION-docker.pkg.dev/PROJECT/anchor/anchor-api .
```

Set Twilio / Gemini secrets on the Cloud Run service (see `apps/api/.env.example`).

## Build & deploy site (Firebase Hosting)

```bash
pnpm build:web
firebase deploy --only hosting
```

`firebase.json` rewrites `/api/**` and `/whatsapp` to Cloud Run service `anchor-api` in `europe-west1`.

## Twilio webhook

Point the WhatsApp sandbox (or number) webhook to:

`https://YOUR_FIREBASE_HOSTING_DOMAIN/whatsapp`

## Local development

```bash
pnpm dev:api   # Nest on :3000
pnpm dev:web   # Astro on :4321, proxies /api and /whatsapp → :3000
```
