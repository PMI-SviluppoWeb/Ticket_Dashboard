# === Stage 1: Dependencies (dev + prod, per il build) ===
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# === Stage 1b: Production dependencies (runtime: worker IMAP, sync, nodemailer) ===
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# === Stage 1c: Verifiche statiche (typecheck + test) usate dalla CI ===
# Condivide il layer di `deps`, quindi la successiva build di produzione non
# ripaga l'installazione. `docker build --target check .` fallisce il job se
# typecheck o test non passano, prima che il container vada in produzione.
FROM deps AS check
WORKDIR /app
COPY . .
RUN npm run typecheck && npm test

# === Stage 2: Build ===
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# === Stage 3: Production ===
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache tini

# Utente non root: il processo non gira come root dentro il container.
RUN addgroup -S app && adduser -S app -G app

# Dipendenze runtime complete (il worker IMAP ha bisogno di imapflow/postal-mime,
# che Next NON traccia nel suo standalone in quanto non importati dal server Next)
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
# Output completo di Next (next start richiede .next intero, non solo static)
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/scripts ./scripts
# Il worker (scripts/start-worker-docker.ts) importa ../lib/imap-worker
COPY --from=builder --chown=app:app /app/lib ./lib

# Versione FISSA di tsx: un tag mobile cambierebbe il runtime di produzione
# senza che nessun lockfile lo registri.
RUN npm install -g tsx@4.23.13

# La directory uploads e' un volume: deve esistere ed essere scrivibile
# dall'utente non root.
RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "scripts/start-services.sh"]
