# === Stage 1: Dependencies (dev + prod, per il build) ===
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# === Stage 1b: Production dependencies (runtime: worker IMAP, sync, nodemailer) ===
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# === Stage 2: Build ===
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# === Stage 3: Production ===
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache tini

# Dipendenze runtime complete (il worker IMAP ha bisogno di imapflow/postal-mime,
# che Next NON traccia nel suo standalone in quanto non importati dal server Next)
COPY --from=prod-deps /app/node_modules ./node_modules
# Output standalone di Next (server.js + .next + node_modules tracciato, in merge)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
# Il worker (scripts/start-worker-docker.ts) importa ../lib/imap-worker
COPY --from=builder /app/lib ./lib

RUN npm install -g tsx

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "scripts/start-services.sh"]
