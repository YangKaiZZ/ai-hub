# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Skip the postinstall generate here; we run it explicitly after copying the schema.
RUN npm ci --ignore-scripts

COPY . .

# `next build` imports every route to collect page data, and those imports pull
# in src/lib/env.ts, which refuses to load without a valid configuration. These
# are placeholders that exist only to get past that validation at build time.
#
# They are confined to this stage and never reach the runtime image, which is a
# separate FROM and takes its configuration from the environment. Nothing here
# is baked into the output: the app reads none of these values on the client.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    SESSION_SECRET="build-time-placeholder-not-a-real-secret-0000" \
    INTEGRATION_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
    AI_PROVIDER="mock"

RUN npx prisma generate && npm run build

# ── Runtime stage ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S aihub && adduser -S aihub -G aihub

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
# Next writes its cache under .next at runtime, so only that tree belongs to the app user.
COPY --from=builder --chown=aihub:aihub /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
# The seed is run with tsx against the TypeScript sources and imports the app's
# own services, so it needs src/ and the tsconfig that resolves the "@/" alias.
# The server itself runs from .next and does not read these.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Everything else stays root-owned and read-only to the app. A recursive chown of
# /app here would rewrite every file in node_modules into a second copy of that
# layer: minutes of build time and hundreds of megabytes for nothing.
RUN mkdir -p /data/storage && chown aihub:aihub /data /data/storage
USER aihub

EXPOSE 3000
# Apply migrations, then start. Seeding is opt-in via SEED_DEMO=true.
CMD ["sh", "./scripts/docker-start.sh"]
