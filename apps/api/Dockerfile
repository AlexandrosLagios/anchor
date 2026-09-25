# Cloud Run image for the Nest Anchor API
# Build from repo root: docker build -f apps/api/Dockerfile .
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm build:api

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY --from=build /app/dist/apps/api ./
# importHelpers makes main.js require tslib, and the generated package.json omits tslib
RUN npm pkg set dependencies.tslib=^2.3.0
RUN pnpm install --prod --ignore-workspace
# ponytail: the Gemini cache in tmp/ uses instance memory on Cloud Run, move the cache to a volume if the cache nears the memory limit
RUN mkdir tmp && chown node:node tmp
EXPOSE 8080
USER node
CMD ["node", "main.js"]
