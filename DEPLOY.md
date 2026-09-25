# Deploy Anchor (Vercel web + Nest API + Neon EU)

## Stack

| Piece | Where |
| --- | --- |
| Website (Astro) | Vercel project `anchor`, root `apps/web`, region `fra1` |
| API (NestJS) | Vercel project `anchor-api` → https://anchor-api-teal.vercel.app |
| Database | Neon Postgres `eu-central-1` (Vercel Marketplace) |
| Media | Vercel Blob `anchor-media` in `fra1` |

## Environment

### `anchor-api`

```bash
DATABASE_URL=postgresql://…  # Neon pooled connection, sslmode=require
AUTH_JWT_SECRET=…            # long random secret
DATA_REGION=eu-central-1
REQUIRE_AUTH=true
CORS_ORIGINS=https://anchor-open26.vercel.app,https://anchor-w0nd3rland.vercel.app
GEMINI_API_KEY=…             # optional until AI is exercised
GEMINI_DATA_REGION_NOTE=developer-api-global
BLOB_READ_WRITE_TOKEN=…      # auto-set when Blob store is linked
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
# apps/api/.env.local — DATABASE_URL, AUTH_JWT_SECRET, DATA_REGION
pnpm dev:api
pnpm dev:web   # Vite proxies /api → localhost:3000
```

## Gemini

Current code uses the **Gemini Developer API** (`GEMINI_API_KEY`). Prompts may leave the EU — disclosed in Privacy.

```bash
GEMINI_DATA_REGION_NOTE=developer-api-global
```
