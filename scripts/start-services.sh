#!/bin/sh

echo "================================="
echo "  Ticket Dashboard - Avvio"
echo "================================="

# Avvia il worker IMAP in background
echo "[Docker] Avvio IMAP worker..."
tsx scripts/start-worker-docker.ts &
WORKER_PID=$!

# Avvia Next.js in background (next start, come da next.config senza output standalone)
echo "[Docker] Avvio Next.js server sulla porta 3001..."
./node_modules/.bin/next start -p 3001 -H 0.0.0.0 &
NEXT_PID=$!

# Gestione segnali per shutdown pulito
cleanup() {
  echo "[Docker] Shutdown in corso..."
  kill $WORKER_PID 2>/dev/null
  kill $NEXT_PID 2>/dev/null
  wait
  exit 0
}

trap cleanup SIGTERM SIGINT

# Aspetta che entrambi i processi terminino
wait
