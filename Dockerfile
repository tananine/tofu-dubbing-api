# syntax=docker/dockerfile:1.7

FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip curl unzip \
 && pip3 install --no-cache-dir --break-system-packages edge-tts "yt-dlp[default]" \
 && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
 && npm install -g pm2 \
 && apt-get purge -y --auto-remove curl unzip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
COPY ecosystem.config.js ./ecosystem.config.js

EXPOSE 3000
CMD ["pm2-runtime", "ecosystem.config.js"]
