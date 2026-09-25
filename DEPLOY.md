# Deploy Anchor (Vercel web + Nest API + Neon EU + Blob)

## Stack

| Piece | Where |
| --- | --- |
| Website (Astro) | Vercel project `anchor`, root `apps/web`, region `fra1` → https://anchor-open26.vercel.app |
| API (NestJS) | Vercel project `anchor-api` → https://anchor-api-teal.vercel.app |
| Accounts | Nest JWT (`AUTH_JWT_SECRET`) + Neon `users` / `user_consents` |
| Database | Neon Postgres `eu-central-1` project `icy-math-96967649` (Marketplace name `anchor`) |
| Media | Vercel Blob `anchor-media` in `fra1` (`store_pI9wAfpXuBOpU6bF`) |

Firebase Auth / service-account keys are **not** required.

## Environment

### `anchor-api`

```bash
DATABASE_URL=postgresql://…        # Neon pooled connection, sslmode=require
AUTH_JWT_SECRET=…                  # long random secret (already set on Vercel)
DATA_REGION=eu-central-1
REQUIRE_AUTH=true
CORS_ORIGINS=https://anchor-open26.vercel.app,https://anchor-w0nd3rland.vercel.app
GEMINI_API_KEY=…                   # optional until AI is exercised
GEMINI_DATA_REGION_NOTE=developer-api-global
BLOB_READ_WRITE_TOKEN=…            # set when Blob store is linked / copied
```

### `anchor` (website)

```bash
PUBLIC_PRIVACY_EMAIL=privacy@anchor.com
PUBLIC_REQUIRE_AUTH=true
PUBLIC_DATA_REGION=eu-central-1
PUBLIC_SITE_URL=https://anchor-open26.vercel.app
```

Rewrites in `apps/web/vercel.json` proxy `/api/*` and `/whatsapp` to `https://anchor-api-teal.vercel.app`.

## Local development

```bash
# apps/api/.env.local — DATABASE_URL, AUTH_JWT_SECRET, DATA_REGION, optional BLOB_READ_WRITE_TOKEN
pnpm dev:api
pnpm dev:web   # proxies /api → localhost:3000
```

## Gemini

Current code uses the **Gemini Developer API** (`GEMINI_API_KEY`). Prompts may leave the EU — disclosed in Privacy.

```bash
GEMINI_DATA_REGION_NOTE=developer-api-global
```
