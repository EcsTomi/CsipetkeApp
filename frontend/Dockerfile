# syntax=docker/dockerfile:1

# Build stage
FROM node:22-slim AS build

# Enable corepack so pnpm is available at the version pinned in package.json
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy lockfile + manifests for layer caching
COPY package.json pnpm-lock.yaml ./
# Hiba esetén -> pnpm install (frontenden)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

RUN --mount=type=cache,target=/app/.angular/cache \
    pnpm run build --stats-json

# Runtime stage
FROM nginx:alpine

COPY --from=build /app/dist/csipetke/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
