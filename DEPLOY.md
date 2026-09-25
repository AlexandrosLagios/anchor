# Deploy Anchor (Vercel web + Nest API + Neon EU + Blob)

## Stack

| Piece | Where |
| --- | --- |
| Website (Astro) | Vercel project `anchor`, root `apps/web`, region `fra1` → https://anchor-open26.vercel.app |
| API (NestJS) | Vercel project `anchor-api` → https://anchor-api-teal.vercel.app |
| Accounts | Nest JWT (`AUTH_JWT_SECRET`) + Neon `users` / `user_consents` |
| Database | Neon Postgres `eu-central-1` project `icy-math-96967649` (Marketplace name `anchor`) |
| Media | Vercel Blob `anchor-media` in `fra1` (`store_pI9wAfpXuBOpU6bF`) |
| Telegram bot (NestJS) | Cloud Run service `anchor-bot` in `europe-west1`, record on a Cloud Storage volume |

Firebase Auth / service-account keys are **not** required.

## Environment

### `anchor-api`

```bash
DATABASE_URL=postgresql://…        # Neon pooled connection, sslmode=require
AUTH_JWT_SECRET=…                  # long random secret (already set on Vercel)
DATA_REGION=eu-central-1
REQUIRE_AUTH=true
CORS_ORIGINS=https://anchor-open26.vercel.app,https://anchor-w0nd3rland.vercel.app
OPENAI_API_KEY=…                   # required for moments, recall, and speech
OPENAI_DATA_REGION_NOTE=openai-api-global
BLOB_READ_WRITE_TOKEN=…            # set when Blob store is linked / copied
```

### `anchor` (website)

```bash
PUBLIC_PRIVACY_EMAIL=privacy@anchor.com
PUBLIC_REQUIRE_AUTH=true
PUBLIC_DATA_REGION=eu-central-1
PUBLIC_SITE_URL=https://anchor-open26.vercel.app
OPENAI_API_KEY=…                   # same secret as anchor-api; server-only, not PUBLIC_
```

Rewrites in `apps/web/vercel.json` proxy `/api/*` and `/whatsapp` to `https://anchor-api-teal.vercel.app`.

## Local development

```bash
# apps/api/.env.local — DATABASE_URL, AUTH_JWT_SECRET, DATA_REGION, optional BLOB_READ_WRITE_TOKEN
pnpm dev:api
pnpm dev:web   # proxies /api → localhost:3000
```

## OpenAI

Current code uses the **OpenAI API** (`OPENAI_API_KEY`) for moment extraction, recall checks, transcription, and speech. Prompts may leave the EU — disclosed in Privacy.

```bash
OPENAI_DATA_REGION_NOTE=openai-api-global
OPENAI_MODEL=gpt-4.1-mini
```

## Telegram bot (`anchor-bot` on Cloud Run)

The Cloud Run service `anchor-bot` runs the API image as one instance that is always on. The instance polls Telegram, so the service needs no public URL. The record (`ANCHOR_STATE_FILE`) is a file in a Cloud Storage bucket that the service mounts as a volume. `anchor-api` on Vercel never sets `TELEGRAM_BOT_TOKEN`, so `anchor-api` starts no poll.

At list price, 1 vCPU and 512 MiB always on cost about 1.64 USD per day before the free tier. A person runs these commands, because the deploy costs money.

You need a billing account on the project, `gcloud` signed in as a project owner, and Docker. Set these variables once per shell. Run every command from the repository root.

```bash
PROJECT=a11y-hack26ath-267
REGION=europe-west1
BUCKET=$PROJECT-anchor-state
SA=anchor-bot@$PROJECT.iam.gserviceaccount.com
IMAGE=$REGION-docker.pkg.dev/$PROJECT/anchor/anchor-bot
```

### Create the resources once

1. Enable the APIs.

   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com --project=$PROJECT
   ```

2. Create the image repository and the bucket.

   ```bash
   gcloud artifacts repositories create anchor --repository-format=docker --location=$REGION --project=$PROJECT
   gcloud storage buckets create gs://$BUCKET --location=$REGION --uniform-bucket-level-access --public-access-prevention --project=$PROJECT
   ```

3. Create the service account of the bot.

   ```bash
   gcloud iam service-accounts create anchor-bot --project=$PROJECT
   ```

4. Give the service account read and write access to the bucket.

   ```bash
   gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectUser
   ```

5. Store the bot token and the OpenAI key as secrets. The commands read the values from `apps/api/.env.local`, so the values stay out of the shell history.

   ```bash
   grep '^TELEGRAM_BOT_TOKEN=' apps/api/.env.local | cut -d= -f2- | tr -d '\r\n' | gcloud secrets create anchor-telegram-bot-token --data-file=- --project=$PROJECT
   grep '^OPENAI_API_KEY=' apps/api/.env.local | cut -d= -f2- | tr -d '\r\n' | gcloud secrets create anchor-openai-api-key --data-file=- --project=$PROJECT
   ```

6. Give the service account read access to the two secrets.

   ```bash
   for secret in anchor-telegram-bot-token anchor-openai-api-key; do
     gcloud secrets add-iam-policy-binding $secret --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor --project=$PROJECT
   done
   ```

### Deploy

Only one process can poll a bot token. Before you deploy, stop `pnpm dev:api` and every other process that uses the token. A second poller gets a 409 from Telegram.

Start the deployed bot on a fresh record. Do not copy `tmp/anchor-state.json` from a laptop run. The demo clock counts from `State.clockStart`, so a record from a run with a different `ANCHOR_DAY_SECONDS` jumps in time.

1. Build the image for `linux/amd64`. Cloud Run runs only Linux x86_64 images.

   ```bash
   docker build --platform=linux/amd64 -f apps/api/Dockerfile -t $IMAGE .
   ```

2. Push the image to Artifact Registry.

   ```bash
   gcloud auth configure-docker $REGION-docker.pkg.dev
   docker push $IMAGE
   ```

3. Deploy the service.

   ```bash
   gcloud run deploy anchor-bot --project=$PROJECT --region=$REGION --image=$IMAGE \
     --service-account=$SA --no-allow-unauthenticated \
     --min-instances=1 --max-instances=1 --no-cpu-throttling --cpu=1 --memory=512Mi \
     --add-volume=name=state,type=cloud-storage,bucket=$BUCKET,mount-options="uid=1000;gid=1000" \
     --add-volume-mount=volume=state,mount-path=/data \
     --set-env-vars=ANCHOR_STATE_FILE=/data/anchor-state.json,TZ=Europe/Athens \
     --set-secrets=TELEGRAM_BOT_TOKEN=anchor-telegram-bot-token:latest,OPENAI_API_KEY=anchor-openai-api-key:latest
   ```

4. If the bot is already in the group, remove the bot from the group. Anchor creates the family only when Anchor joins a group.

5. Add the bot to the group, and promote the bot to admin. Anchor posts `intro`.

6. Send a photo with a caption in the group. Anchor reacts with ❤. If Anchor does not react, read the log.

   ```bash
   gcloud run services logs read anchor-bot --project=$PROJECT --region=$REGION --limit=50
   ```

The deploy flags do these things:

- `--min-instances=1` and `--max-instances=1` keep one instance, so one process polls the token.
- `--no-cpu-throttling` keeps the CPU on between requests, so the poll and the 2-second tick keep running.
- `--no-allow-unauthenticated` rejects every request without IAM, because the bot needs no inbound request.
- The image runs as the `node` user, uid 1000. A volume belongs to root by default, so `uid=1000;gid=1000` lets `node` write the record.
- A volume mount needs the second generation execution environment. Cloud Run selects that environment when the service sets no execution environment.
- `TZ=Europe/Athens` puts the 11:00 and 18:00 slots on Athens time.
- `ANCHOR_DAY_SECONDS` stays unset, so the demo clock runs at real time. Each slot fires once per day, at 11:00 and at 18:00.

For the demo, an admin moves the bot on cue. `/fastforward <days>` moves the demo clock, `/memory` posts a memory at once, and `/send` sends the invitations at once.

### Update or stop the bot

Deploy while the family is quiet. During a rollout, the old and the new instance run together for a short time, and the last write to the record wins.

- To deploy a new version, run `pnpm deploy:bot` (see "One-command deploy").
- To stop the bot and the cost, delete the service. The bucket keeps the record.
- Before a laptop run with the same token, delete the service. The service polls the token all the time.

```bash
gcloud run services delete anchor-bot --project=$PROJECT --region=$REGION
```

### One-command deploy

To deploy the latest `main` to the live bot, run the deploy script from a clean checkout of `origin/main`:

```bash
git switch --detach origin/main
pnpm deploy:bot
```

`scripts/deploy-bot.sh` runs `pnpm nx test api`, builds the image for `linux/amd64`, pushes the image with the short commit as its tag, and deploys the image as a new revision. The revision keeps the flags, the secrets, and the volume of the service. The script stops when the working tree has changes or when `HEAD` is not `origin/main`, so no unmerged code reaches the live bot.

You need Docker, and `gcloud` signed in with deploy rights on the project. A few 409 lines during the rollout are expected, because the old revision polls until it shuts down.

The project gives no account the IAM admin role, and it blocks service-account keys, so an automatic deploy from GitHub Actions is not possible. Run the script after each merge that changes `apps/api`.

### Phone calls

Anchor rings a member through Twilio and talks through OpenAI Realtime (spec section 4.15). Twilio opens a WebSocket to `/call/stream` on `anchor-bot`, so the service must accept requests without IAM. The call stream accepts a stream only with the one-time token that Anchor issued for that call.

Caution: set `ANCHOR_BOT_ONLY=true` before you open the service. Without the variable, a public `anchor-bot` serves the website API and the WhatsApp webhook. The webhook sends the Twilio key to any media URL in a request, because `TWILIO_AUTH_TOKEN` is empty. With `ANCHOR_BOT_ONLY=true`, the service answers only `GET /` and the call stream.

Each step changes the live service, so each step needs the user's go.

1. Store the Twilio key secret, and give the service account read access to the secret.

   ```bash
   grep '^TWILIO_API_KEY_SECRET=' apps/api/.env.local | cut -d= -f2- | tr -d '\r\n' | gcloud secrets create anchor-twilio-api-key-secret --data-file=- --project=$PROJECT
   gcloud secrets add-iam-policy-binding anchor-twilio-api-key-secret --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor --project=$PROJECT
   ```

2. Set the guard, the call variables, and a request timeout of 15 minutes. A call lasts at most 10 minutes, and Cloud Run closes a WebSocket at the request timeout.

   ```bash
   URL=$(gcloud run services describe anchor-bot --project=$PROJECT --region=$REGION --format='value(status.url)')
   envval() { grep "^$1=" apps/api/.env.local | cut -d= -f2- | tr -d '\r\n'; }
   gcloud run services update anchor-bot --project=$PROJECT --region=$REGION --timeout=900 \
     --update-env-vars=ANCHOR_BOT_ONLY=true,ANCHOR_PUBLIC_URL=$URL,TWILIO_ACCOUNT_SID=$(envval TWILIO_ACCOUNT_SID),TWILIO_API_KEY_SID=$(envval TWILIO_API_KEY_SID),TWILIO_FROM=$(envval TWILIO_FROM) \
     --update-secrets=TWILIO_API_KEY_SECRET=anchor-twilio-api-key-secret:latest
   ```

3. Open the service to requests without IAM.

   ```bash
   gcloud run services add-iam-policy-binding anchor-bot --member=allUsers --role=roles/run.invoker --region=$REGION --project=$PROJECT
   ```

4. Check the guard. `GET /` returns 200, and `POST /whatsapp` returns 404.

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' $URL/
   curl -s -o /dev/null -w '%{http_code}\n' -X POST $URL/whatsapp
   ```

5. In the private chat, send "Anchor, call me". The phone of the member rings from `TWILIO_FROM`.

To close the service again, remove the binding:

```bash
gcloud run services remove-iam-policy-binding anchor-bot --member=allUsers --role=roles/run.invoker --region=$REGION --project=$PROJECT
```

`pnpm deploy:bot` keeps the binding, the variables, and the timeout. A full `gcloud run deploy` with the flags of "Deploy" sets `--no-allow-unauthenticated` again.

The call reads these variables:

| Variable | Value |
| --- | --- |
| `ANCHOR_BOT_ONLY` | `true` on `anchor-bot`. Unset everywhere else. |
| `ANCHOR_PUBLIC_URL` | The `https://` URL of `anchor-bot`. Twilio connects to `wss://` on the same host. |
| `ANCHOR_REALTIME_MODEL` | Optional. The default is `gpt-realtime-2.1`. |
| `TWILIO_FROM` | The Twilio number that Anchor calls from, in E.164. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID` | Plain variables. |
| `TWILIO_API_KEY_SECRET` | The secret `anchor-twilio-api-key-secret`. |

A call to a Greek mobile needs Greece in the Twilio voice geo permissions. Low-risk numbers for Greece are on.
