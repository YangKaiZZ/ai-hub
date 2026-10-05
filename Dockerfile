# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Skip the postinstall generate here; we run it explicitly after copying the schema.
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate && npm run build

# ── Runtime stage ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S aihub && adduser -S aihub -G aihub

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
# The seed is run with tsx against the TypeScript sources and imports the app's
# own services, so it needs src/ and the tsconfig that resolves the "@/" alias.
# The server itself runs from .next and does not read these.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /data/storage && chown -R aihub:aihub /data /app
USER aihub

EXPOSE 3000
# Apply migrations, then start. Seeding is opt-in via SEED_DEMO=true.
CMD ["sh", "./scripts/docker-start.sh"]
