# Deploy Anchor (Vercel web + Nest API + Firebase Auth + Neon/Blob)

## Stack

| Piece | Where |
| --- | --- |
| Website (Astro) | Vercel project `anchor`, root `apps/web`, region `fra1` |
| API (NestJS) | Vercel project `anchor-api` → https://anchor-api-teal.vercel.app |
| Accounts | Firebase Auth + Firestore (`eur3`) — project `a11y-hack26ath-267` |
| File metadata | Neon Postgres `eu-central-1` (`user_files.user_id` is TEXT for Firebase UIDs) |
| Media | Vercel Blob `anchor-media` in `fra1` |

## Environment

### `anchor-api`

```bash
FIREBASE_PROJECT_ID=a11y-hack26ath-267
GOOGLE_CLOUD_PROJECT=a11y-hack26ath-267
# ADC / service account for Admin SDK verifyIdToken (not a Google API key)
GOOGLE_APPLICATION_CREDENTIALS=…   # optional path to SA JSON
DATABASE_URL=postgresql://…        # Neon pooled connection (file metadata + snapshots)
DATA_REGION=eur3
REQUIRE_AUTH=true
CORS_ORIGINS=https://anchor-open26.vercel.app,https://anchor-w0nd3rland.vercel.app
GEMINI_API_KEY=…                   # optional until AI is exercised
GEMINI_DATA_REGION_NOTE=developer-api-global
BLOB_READ_WRITE_TOKEN=…            # auto-set when Blob store is linked
```

### `anchor` (website)

```bash
PUBLIC_PRIVACY_EMAIL=privacy@anchor.com
PUBLIC_REQUIRE_AUTH=true
PUBLIC_DATA_REGION=eur3
PUBLIC_SITE_URL=https://anchor-open26.vercel.app
PUBLIC_FIREBASE_API_KEY=…
PUBLIC_FIREBASE_AUTH_DOMAIN=…
PUBLIC_FIREBASE_PROJECT_ID=a11y-hack26ath-267
PUBLIC_FIREBASE_STORAGE_BUCKET=…
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
PUBLIC_FIREBASE_APP_ID=…
```

Rewrites in `apps/web/vercel.json` proxy `/api/*` and `/whatsapp` to `https://anchor-api-teal.vercel.app`.

## Firebase console checklist

1. Enable **Authentication → Sign-in method → Email/Password**.
2. Create **Firestore** in **`eur3`** (Europe multi-region) if not already.
3. Rules: authenticated users can read/write their own `users/{uid}` doc (consents live there).

## Local development

```bash
# once: gcloud auth application-default login
# apps/api/.env.local — FIREBASE_PROJECT_ID, DATABASE_URL, BLOB_READ_WRITE_TOKEN
pnpm dev:api
pnpm dev:web   # Vite proxies /api → localhost:3000
```

## Gemini

Current code uses the **Gemini Developer API** (`GEMINI_API_KEY`). Prompts may leave the EU — disclosed in Privacy.

```bash
GEMINI_DATA_REGION_NOTE=developer-api-global
```
