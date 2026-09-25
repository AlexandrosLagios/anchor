#!/usr/bin/env bash
# Deploy anchor-bot from origin/main: test, build, push, and roll out a new Cloud Run revision.
# The revision keeps the service's flags, secrets, and volume (DEPLOY.md). Only the image changes.
set -euo pipefail

PROJECT=a11y-hack26ath-267
REGION=europe-west1
IMAGE=$REGION-docker.pkg.dev/$PROJECT/anchor/anchor-bot

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin main

if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree has changes. Commit or stash them, then run the deploy again." >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "The deploy runs only from origin/main. Run: git switch --detach origin/main" >&2
  exit 1
fi

tag="$IMAGE:$(git rev-parse --short HEAD)"
echo "Deploying $tag"

pnpm install --frozen-lockfile
pnpm nx test api
docker build --platform=linux/amd64 -f apps/api/Dockerfile -t "$tag" .
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker push "$tag"
gcloud run deploy anchor-bot --project="$PROJECT" --region="$REGION" --image="$tag" --quiet

echo "Live: $(gcloud run services describe anchor-bot --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
echo "A few 409 lines during the rollout are expected: the old revision polls until it shuts down."
