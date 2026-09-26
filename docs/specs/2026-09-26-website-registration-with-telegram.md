# Website: register with Telegram, show family record

Owner: `apps/web` owner. Bot side: Alexandros. Date: 2026-09-26.

## Problem

- Website must register family members with Telegram id: no email, no password.
- Website must show signed-in member's family record: moments, photos, stories.
- Website must give GDPR rights as buttons: export my data, delete my data.
- "Ethics, Security & Inclusion" = 1 of 5 equal judging criteria (https://open-hackathon.gr/judging/).

## Findings

- Family record lives only in bot `anchor-bot` (Cloud Run, JSON file in Cloud Storage, `europe-west1`). Website never reads it.
- `/app` = scripted demo, no API call (`apps/web/src/components/MvpDemo.tsx`).
- `/family` = Neon families: UUID ids, email members. Telegram families: group chat id, Telegram user ids. No shared key.
- Email accounts: bcrypt password, 7-day JWT in `localStorage`, no email verification (`apps/api/src/app/auth.service.ts`, `apps/web/src/lib/auth.ts`).
- Signup claims every invite for its email, unverified: anyone signing up with invited address joins that family (`apps/api/src/app/families.service.ts`, `claimInvites`).
- Owner can create account for another person and tick consent for them (`families.service.ts`, `addMember`).
- Account page offers GDPR rights by email only (`apps/web/src/components/AccountPanel.tsx:65`).
- Privacy page names Neon, Blob, OpenAI, Twilio WhatsApp. Missing: Telegram, Cloud Run, Cloud Storage, Twilio voice call (`apps/web/src/pages/privacy.astro`).
- Vercel cannot read bot bucket: org policy blocks service-account keys.
- `anchor-bot` already public (call stream) behind `ANCHOR_BOT_ONLY` guard. CORS already allows `https://anchor-open26.vercel.app` and `http://localhost:4321` (`apps/api/src/main.ts`).
- Telegram Login = OpenID Connect (https://core.telegram.org/widgets/login):
  - JS library returns `id_token` to page callback, needs Client ID only.
  - `id_token`: RS256, issuer `https://oauth.telegram.org`, audience = bot id, JWKS `https://oauth.telegram.org/.well-known/jwks.json`, `exp` about 1 hour.
  - Scopes: `openid`, `profile`, `phone`, `telegram:bot_access` (bot may message user after login).
  - Popup breaks only under `Cross-Origin-Opener-Policy: same-origin`. Live site sends none (`curl -sI https://anchor-open26.vercel.app/`).
- `t.me/<bot>?startgroup&admin=<rights>` opens group picker and adds bot as admin (https://core.telegram.org/api/links).
- Telegram file URL contains bot token (`apps/api/src/app/transports/telegram.ts`, `download`): photos must stream through bot, never as Telegram URL.
- Join gate merged: person outside Telegram group cannot join family from start link (https://github.com/High-Contrast-Team/anchor/pull/45).

## Decisions

- One identity: Telegram id. Email accounts leave website. Reason: two registrations = two identities, two families with different members.
- Registration on website with Telegram Login. Joining from "Choose what I send you" button in group stays.
- Bot exposes small API on `anchor-bot`; website calls it directly. Reason: bot = only holder of record, no copy, no sync.
- Website scope: family view + My data (export, delete). Choices and admin tools stay in Telegram.
- Family view hides moments Anchor marked sensitive. My data export includes them for their sharer.
- `id_token` in `sessionStorage`, sent only to bot URL.
- `/chat` and file upload removed: both need email account; Telegram covers both (Ask Anchor, photos in group).

## Open questions

- Bot API ships before code stop (Sunday 13:00) or after? Alexandros + website owner.
- Teammates agree to remove `/chat` and file upload? Website owner.
- Delete Neon tables and Blob files? Team. Keep until agreed.
- UNVERIFIED: `telegram:bot_access` lets Anchor message person before Start tap. Website owner checks at first test.
- UNVERIFIED: BotFather allowed URLs accept `http://localhost`. Website owner checks at setup.
- Person leaving Telegram group still gets private messages until next API call or `/start`. Alexandros, bot side.

## Approaches

1. **Chosen: Telegram id registration on website + bot API.**
   - No forms for older adults, no shared secrets, one identity.
   - Cost: BotFather setup, second API origin, bot API work.
2. **Keep email registration, link each account to Telegram.**
   - Keeps existing signup.
   - Cost: link step per person, `AUTH_JWT_SECRET` + `DATABASE_URL` on bot, unverified-email holes stay, password for older adults.
3. **Copy record into Neon, serve via `anchor-api`.**
   - One API origin.
   - Cost: second store of private family data, sync drift, deletion must reach two places.

## Next step

**Setup (once, bot owner)**

1. BotFather mini app → `@anchor_family_bot` → **Login Widget**.
2. Allowed URL: `https://anchor-open26.vercel.app`, plus each other domain showing button.
3. Copy Client ID to website owner. Client Secret never goes in website.
4. Website owner sets `PUBLIC_TELEGRAM_CLIENT_ID`, `PUBLIC_BOT_URL` on Vercel project `anchor` and in `apps/web/.env.example`.

Dev bot = separate Client ID (audience = bot id).

**Bot API (built by Alexandros; mock until live)**

Base URL: `https://anchor-bot-tl7qfnc7aq-ew.a.run.app`. Every request: `Authorization: Bearer <id_token>`.

| Request | Response |
| --- | --- |
| `POST /web/join` | `{ status: 'joined', family: { members: [{ id, name }] } }` when person is in family group with Anchor. Else `{ status: 'no-family', addLink }`, `addLink` = `https://t.me/anchor_family_bot?startgroup&admin=delete_messages`. |
| `GET /web/me` | `{ member: { id, name }, family: { members: [{ id, name }] } }` |
| `GET /web/moments` | Family moments, newest first, no sensitive ones: `{ id, by: { id, name }, savedAt, title, text, eventDate?, hasPhoto, hasVoice, stories: [{ id, by, at, text, hasVoice }] }` |
| `GET /web/moments/:id/photo` | Image bytes |
| `GET /web/moments/:id/voice` | Audio bytes |
| `GET /web/my-data` | JSON export: member record + every moment and story by person, sensitive included |
| `DELETE /web/my-data` | Deletes person's moments and stories, removes person from record. Telegram group messages stay in Telegram. |

- `401`: token missing, expired, invalid → show button again.
- `403`: person not in record or left group → run registration again.

**Registration flow**

1. Person taps "Get started with Telegram" → Telegram Login returns `id_token`.
2. Website calls `POST /web/join`.
3. `joined`: Anchor sends choices screen in private chat. Website shows family page.
4. `no-family`: website shows "Add Anchor to your family group" with `addLink`. Telegram picks group, adds Anchor as admin. Anchor records adder as first member.
5. After adding, website calls `POST /web/join` again → step 3.

**Build**

1. "Get started with Telegram" button: Telegram Login JS library, snippet from https://core.telegram.org/widgets/login, scopes `openid profile telegram:bot_access`.
2. `id_token` in `sessionStorage`. On `401`, show button again.
3. Family page from `GET /web/me` + `GET /web/moments`: sharer, words, stories.
4. Photos and voice notes: `fetch` with `Authorization` header → `URL.createObjectURL`. `<img>` cannot send header.
5. "Download my data": save `GET /web/my-data` as JSON file.
6. "Delete my data": confirm first, name what goes away, then `DELETE /web/my-data`.

Fallback when Anchor's private message does not arrive: "Open Anchor in Telegram" button → `https://t.me/anchor_family_bot`.

**Remove email accounts**

1. Remove `/signup`, `/login`, `/account`, `/family`, their components, `apps/web/src/lib/auth.ts`, links in `BaseLayout.astro`, `index.astro`, `designs/` pages.
2. Remove `/chat` and file upload (`AnchorChat`, `FileDrop`).
3. Remove unused `anchor-api` routes: `/api/auth/*`, `/api/families/*`, `/api/files/*`, `/api/chat`. `AuthGuard` reads email JWT, so remove it from prototype routes too.
4. Keep Neon tables and Blob files until team agrees.
5. Under Telegram button: "By signing in, you accept the Terms and the Privacy Policy", both linked.

**Privacy page**

- Remove: account data, email invites, uploaded files.
- Add: Telegram, Telegram Login, bot on Cloud Run `europe-west1`, record in Cloud Storage, Twilio voice call.

**Rules**

- `id_token` never in URL, log, or `localStorage`.
- `id_token` goes only to `PUBLIC_BOT_URL`.
- Never add `Cross-Origin-Opener-Policy: same-origin`. `same-origin-allow-popups` works.
- Older adults use page: large tap targets, labels that say what tap does, screen-reader text.

**Done when**

- Demo-group member who never talked to Anchor registers on website, gets choices screen in Telegram.
- Person with no family group adds Anchor to new group from website, joins as first member.
- Registered member sees family moments with photos.
- "Download my data" saves JSON. "Delete my data" asks first.
- No page asks for email or password.
- `pnpm lint`, `pnpm typecheck`, Vercel build of `anchor` pass.
