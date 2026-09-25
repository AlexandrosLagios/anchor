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
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY --from=build /app/dist/apps/api ./
RUN pnpm install --prod --ignore-workspace
EXPOSE 8080
USER node
CMD ["node", "main.js"]
