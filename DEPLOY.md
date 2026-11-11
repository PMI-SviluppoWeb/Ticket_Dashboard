# Deploy con Docker

Stack: `ticket-dashboard` (build multi-stage, Next.js + worker IMAP) + `watchtower` (auto-update da GHCR).
Porta: **3001**.

---

## 1. Verifica locale sul PC (prima di deployare)

### 1.1 Avviare il daemon Docker
Docker Desktop deve essere in esecuzione (altrimenti `docker info` fallisce con *"pipe not found"*).
1. Aprire **Docker Desktop** dal menu Start
2. Aspettare che l'icona in tray diventi animata/verde
3. Verificare:
```powershell
docker --version
docker info
```

### 1.2 Smoke test dell'engine
```powershell
docker run --rm hello-world     # test base: se esce "Hello from Docker!" funziona tutto
docker system df                # spazio occupato da immagini/volumi/container
```

### 1.3 Creare il file `.env` (obbligatorio)
Il `docker-compose.yml` dichiara `env_file: .env`: senza questo file il compose fallisce all'avvio.
```powershell
Copy-Item .env.docker.example .env
notepad .env                    # compilare con i valori reali
```
Suggerimento: molti valori sono già in `.env.local` (usato da `npm run dev`), basta unirli.

> ⚠️ `JWT_SECRET` e `WEBHOOK_SECRET` sono **obbligatori in produzione**: senza il
> primo le sessioni sono forgiabili, senza il secondo la rotta
> `/api/hooks/email` risponde 503 e nessuna email diventa ticket.
> `WEBHOOK_SECRET` deve essere lo stesso valore per l'app e per l'IMAP worker
> (entrambi leggono lo stesso `.env`).

### 1.4 Validare il compose senza eseguirlo
```powershell
docker compose config           # se non errori, il file è valido
```

### 1.5 Build e avvio
```powershell
docker compose up -d --build
docker compose ps               # ticket-dashboard deve diventare "healthy" dopo ~15s
docker compose logs -f ticket-dashboard
```

### 1.6 Test funzionali
- `http://localhost:3001` → login e caricamento dashboard
- Nei log cercare `IMAP` → il worker deve fare il poll senza errori
- Inviare/registrare una email di test → deve comparire il ticket (verifica webhook + IMAP)
- Caricare un allegato su un ticket → deve comparire nella cartella `uploads/`

### 1.7 Monitoraggio risorse (stesso comando da usare sul server)
```powershell
docker stats                    # RAM/CPU live (Ctrl+C per uscire)
docker compose logs ticket-dashboard | findstr Error
```

> Nota: in locale per i test basta avviare solo l'app:
> `docker compose up -d --build ticket-dashboard`

---

## 2. Controlli importanti su `docker-compose.yml`

Questi 4 punti sono critici per il funzionamento in produzione:

| # | Problema | Soluzione |
|---|----------|-----------|
| 1 | `uploads/` non montato → allegati persi ad ogni rebuild | volume `- ./uploads:/app/uploads` |
| 2 | Watchtower usa `--label-enable` ma il service non ha la label | label `com.centurylinklabs.watchtower.enable=true` |
| 3 | Watchtower tira un'immagine da GHCR ma il service ha solo `build:` | aggiungere `image: ghcr.io/<tuousername>/<repo>:main` |
| 4 | Nessun limite RAM/CPU e nessuna rotazione dei log (i log su Windows mangiano disco) | `deploy.resources.limits` + `logging` con max-size |
| 5 | Il standalone di Next ascolta su `:3000`, ma la mappatura è `3001:3001` | `PORT=3001` + `HOSTNAME=0.0.0.0` in `environment` |
| 6 | `localhost` risolve su IPv6 `::1`, che il server non serve → healthcheck/Webhook falliscono | usare `127.0.0.1` in healthcheck e `WEBHOOK_URL` |

Riferimento – impostazioni attese nel `docker-compose.yml`:

```yaml
services:
  ticket-dashboard:
    build: .
    image: ghcr.io/<tuousername>/<repo>:main   # stesso nome spinto da GitHub Actions
    container_name: ticket-dashboard
    restart: unless-stopped
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    ports:
      - "3001:3001"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=3001                        # standalone Next ascolta su 3000 di default
      - HOSTNAME=0.0.0.0                 # altrimenti si lega al solo hostname del container
      - IMAP_POLL_INTERVAL_MS=300000
      - WEBHOOK_URL=http://127.0.0.1:3001/api/hooks/email
    volumes:
      - ./uploads:/app/uploads                  # persistenza allegati
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.5"
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3001"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true                 # rimuove le immagini vecchie dopo il pull
      - WATCHTOWER_POLL_INTERVAL=300
      - WATCHTOWER_LABEL_ENABLE=true
    command: --label-enable
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 3. Setup sul server Windows

### 3.1 Prerequisiti
1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ (supporto WSL2 consigliato)
2. Riavviare il server dopo l'installazione
3. **Git**: https://git-scm.com/download/win

### 3.2 Limitare la RAM (passaggio CRITICO)
Senza limiti, Docker Desktop/WSL2 può allocare gran parte della RAM del server.

**a) Limite della VM WSL2** – creare/editare `C:\Users\<utente>\.wslconfig`:
```ini
[wsl2]
memory=3GB
processors=2
swap=1GB
```
(Applicare con `wsl --shutdown` e riavvio di Docker Desktop)

**b) Limite di Docker Desktop** – Settings → **Resources**:
- Memory limit = **2.5GB**
- Swap = **1GB**
- Apply & Restart

**c) Limite del container** – già imposto nel compose (`memory: 1G`).

Risultato atteso: app ~1GB max, Docker Desktop/WSL2 ~3GB, resto libero per Windows Server.

### 3.3 Deploy iniziale
```powershell
cd C:\Users\<utente>\Desktop
git clone https://github.com/<tuousername>/<repo>.git
cd <repo>
Copy-Item .env.docker.example .env
notepad .env
docker login ghcr.io            # solo se il package GHCR è privato
docker compose up -d --build
docker compose ps
```

**Nota SQL Server Windows Auth:** il container Linux NON supporta Windows Authentication.
Per la sync clienti usare SQL Server Authentication (utente/password) in `.env`.

### 3.4 Avvio automatico
- Docker Desktop → Settings → **Start Docker Desktop when you sign in** ✓
- I container hanno già `restart: unless-stopped` → si rialzano da soli dopo riavvio/reboot ✓

---

## 4. Auto-deploy con GitHub Actions + Watchtower

### Flusso
1. `git push` da qualsiasi postazione
2. GitHub Actions (`.github/workflows/deploy.yml`) builda l'immagine e la pusha su **GHCR** con tag `main` e `<sha>`
3. Watchtower (ogni 300s) controlla GHCR, fa pull della nuova immagine, riavvia il container
4. `WATCHTOWER_CLEANUP=true` elimina le immagini vecchie → **zero intervento manuale, zero accumulo disco**

### Configurazione GitHub
```powershell
git remote add origin https://github.com/<tuousername>/<repo>.git
git branch -M main
git push -u origin main
```

### Requisiti perché Watchtower funzioni
1. Nel `docker-compose.yml` il service deve avere `image: ghcr.io/<tuousername>/<repo>:main` (non solo `build:`) **e** la label `com.centurylinklabs.watchtower.enable=true`
2. Il package GHCR deve essere **pubblico**:
   GitHub → package → Settings → **Change visibility → Public**
   (in alternativa `docker login ghcr.io` sul server con un PAT)
3. I nomi dei repository/package GHCR devono essere **minuscoli**: se il repo si chiama `App-Ticket-Dashboard`, rinominarlo (es. `app-ticket-dashboard`) oppure GHCR rifiuta il push

### Aggiornamento manuale (fallback)
```powershell
docker compose pull
docker compose up -d
```

---

## 5. Igiene disco e ottimizzazione spazio

- **Log rotation** nel compose (`logging: local, max-size 10m, max-file 3`) → max ~30MB di log per container
- **Watchtower cleanup** → rimuove le immagini superate ad ogni update
- **Build multi-stage** nel `Dockerfile` → in produzione servono solo `.next/standalone` + `scripts/`, non `node_modules` di sviluppo né `.next` completo
- **`.dockerignore`** esclude `node_modules`, `.next`, `data/`, `uploads/`, `docs/`, `screen/` → contesto di build leggero
- **Prune periodico** (opzionale) – Task Scheduler settimanale:
  ```powershell
  docker image prune -f; docker container prune -f
  ```
- **Posizione dei dati Docker**: Docker Desktop → Settings → Resources → Advanced → *Disk image location*, se il disco C è stretto spostarlo su un altro volume

---

## 6. Comandi utili

```powershell
# Log in tempo reale
docker compose logs -f ticket-dashboard

# Log filtrati
docker compose logs ticket-dashboard | findstr IMAP
docker compose logs ticket-dashboard | findstr Error

# Stato / risorse
docker compose ps
docker stats

# Riavviare / fermare / ricostruire
docker compose restart ticket-dashboard
docker compose down
docker compose up -d --build

# Debug: entrare nel container
docker exec -it ticket-dashboard sh

# Pulizia disco
docker system df
docker image prune -a -f
```

---

## 7. Caselle email multiple (configurate dall'app)

Oltre alla casella singola in `.env` (che resta valida come fallback), si
possono collegare più caselle direttamente dall'applicazione: **Admin →
Caselle Email** (`/admin/email`).

- Ogni casella ha IMAP + SMTP dello stesso account: i ticket nascono dalle
  mail in entrata e le risposte (autorisposta, notifiche, aggiornamenti)
  partono dallo stesso indirizzo che ha ricevuto il messaggio.
- La casella **predefinita** invia le email dei ticket creati manualmente.
- Le password sono cifrate nel database con `ENCRYPTION_KEY` (in `.env`):
  senza quella variabile il form resta disabilitato. **Non cambiarla** una
  volta salvate le caselle, altrimenti le password diventano illeggibili.
- Il worker rilegge l'elenco caselle a ogni ciclo di polling
  (`IMAP_POLL_INTERVAL_MS`, 5 minuti in produzione): le modifiche sono
  attive senza riavviare il container. Una casella nuova parte col
  high-water mark all'UID più alto esistente (non processa le mail vecchie).
- La verifica di connessione (IMAP + SMTP) è disponibile nel form e nella
  tabella, utile subito dopo il salvataggio.

---

## 8. Integrazione Google Calendar

Il calendario condiviso dell'app può essere pubblicato su un calendario Google,
così il team lo vede da telefono e desktop senza aprire la dashboard.

**La sincronizzazione è a UNA DIREZIONE: dall'app verso Google.** L'app resta
l'unica fonte di verità; Google è in sola lettura per il team. Non esiste
sincronizzazione inversa né gestione dei conflitti: una modifica fatta a mano
su un evento Google viene sovrascritta al successivo salvataggio nell'app.

Gli eventi finiscono su Google **solo se l'attività ha una scadenza**. L'evento
**termina alla scadenza**: se l'attività ha anche un inizio, l'evento va da
inizio a scadenza; altrimenti parte un'ora prima (scadenza 17:30 → 16:30–17:30).

### 7.1 Creare l'account di servizio

Serve un account di servizio Google, non un OAuth utente: non richiede login
interattivi e non scade.

1. Su [console.cloud.google.com](https://console.cloud.google.com) crea un
   progetto (o riusane uno esistente).
2. **API e servizi → Libreria → Google Calendar API → Abilita**.
3. **IAM e amministrazione → Account di servizio → Crea account di servizio**
   (nome suggerito: `ticket-dashboard-sync`). Nessun ruolo IAM è necessario.
4. Sull'account appena creato: **Chiavi → Aggiungi chiave → Crea nuova chiave →
   JSON**. Si scarica un file contenente `client_email` e `private_key`.
5. Annota il `client_email`: ha la forma
   `ticket-dashboard-sync@tuo-progetto.iam.gserviceaccount.com`.

### 7.2 Condividere il calendario

6. In Google Calendar apri il calendario di destinazione e vai su
   **Impostazioni e condivisione → Condividi con utenti specifici → Aggiungi
   persone**, incolla il `client_email` e assegna il permesso
   **"Apporta modifiche"**. La notifica via email non è necessaria.
7. L'**ID calendario** è l'indirizzo del calendario (es. `info@azienda.it`)
   oppure, per un calendario secondario, l'id
   `...@group.calendar.google.com` che trovi in fondo a
   **Impostazioni e condivisione → Integra calendario → ID calendario**.

> ⚠️ **Su un account Gmail gratuito** non esiste la domain-wide delegation, e la
> condivisione manuale **non** fa comparire il calendario nell'elenco dei
> calendari dell'account di servizio. Per questo nel pannello di configurazione
> l'ID si può sempre scrivere a mano, e c'è il pulsante **Verifica accesso**.

### 7.3 Configurare l'applicazione

Aggiungi al file `.env`:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=ticket-dashboard-sync@tuo-progetto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

- La **chiave privata va su una riga sola**, con gli a-capo scritti come `\n`:
  `env_file` di docker-compose non supporta valori multi-riga. Il codice
  ripristina gli a-capo all'avvio.
- Queste variabili **non vanno mai committate**: la chiave firma token per conto
  dell'account di servizio, che ha accesso in scrittura al calendario. `.env` e
  `.env*.local` sono già in `.gitignore` e `.dockerignore`.
- Variabili opzionali, con default nel codice:
  `GOOGLE_OAUTH_TOKEN_URL`, `GOOGLE_CALENDAR_API_BASE` (per i test con uno stub
  locale) e `GOOGLE_DRY_RUN=true` (simula le chiamate senza toccare la rete).

Riavvia il container, poi apri **Calendario → pulsante «Google»**:

1. attiva **Sincronizzazione attiva**;
2. scegli se usare **un calendario per origine** (attività di progetto, eventi
   con cliente, eventi generici) oppure **tutti gli eventi su un solo
   calendario**;
3. per ogni riga incolla l'ID calendario e premi **Verifica accesso**;
4. salva, poi premi **Sincronizza ora**.

La prima sincronizzazione popola il calendario con le attività esistenti,
limitate alla finestra configurata (default: 30 giorni nel futuro). Il pulsante
può essere premuto più volte: elabora a blocchi di 200 e indica quanti elementi
restano.

### 7.4 Come funziona la sincronizzazione

- **Immediata**: creare, modificare o cancellare un'attività aggiorna subito
  Google. Se Google non risponde entro pochi secondi l'operazione nell'app
  riesce comunque, e la sincronizzazione viene riprovata: al salvataggio
  successivo, con **Riprova gli errori**, o con **Sincronizza ora**.
- **Rimozione della scadenza**: l'evento viene cancellato da Google.
- **Cambio di mappatura**: gli eventi già sincronizzati vengono rimossi dal
  calendario vecchio e ricreati nel nuovo alla prima **Sincronizza ora**.
- **Cancellazione di un progetto**: le sue attività vengono rimosse da Google.
  Oltre 25 attività la rimozione viene accodata e smaltita dalla
  sincronizzazione successiva.
- **Modifiche fatte a mano su Google**: se un evento viene cancellato su
  Google, viene ricreato alla modifica successiva nell'app; se viene
  modificato, la modifica viene sovrascritta. L'app è la fonte di verità.
- Lo stato di ogni attività è visibile come badge (verde = sincronizzata,
  rosso = errore, ambra = in attesa) nella pagina del progetto e come puntino
  colorato nei chip del calendario.

### 7.5 Diagnostica

| Sintomo | Causa / Fix |
|---|---|
| Il pannello dice "non configurata" | `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` assenti o container non riavviato |
| `GOOGLE_PRIVATE_KEY non è una chiave PEM valida` | la chiave è su più righe: va messa su una riga sola con `\n` |
| "Il calendario non è condiviso con l'account di servizio" | manca la condivisione con il `client_email`, oppure l'ID è sbagliato |
| Elenco calendari vuoto | normale su Gmail gratuito: scrivi l'ID a mano |
| Tutte le attività in errore con "Nessun calendario configurato" | la mappatura è vuota: assegna un calendario a ogni origine |
| Errore "L'inizio è successivo alla scadenza" | l'attività ha `data_inizio` dopo `data_scadenza`: correggi le date nell'app |
| Gli eventi compaiono a un'ora sbagliata | controlla il campo **Fuso orario** nel pannello (default `Europe/Rome`) |

---

## 9. Risoluzione problemi

| Sintomo | Causa / Fix |
|---|---|
| `failed to connect to the docker API at npipe` | Docker Desktop non avviato → aprirlo e riprovare |
| `env file .env not found` | manca `.env` → `Copy-Item .env.docker.example .env` |
| `/api/hooks/email` risponde 503 | manca `WEBHOOK_SECRET` in `.env` (o il container non è stato riavviato dopo l'aggiunta) |
| `/api/hooks/email` risponde 401 | `WEBHOOK_SECRET` diverso tra i due lati: deve essere lo stesso valore |
| Container `unhealthy` | `docker compose logs ticket-dashboard` e controllare `.env` (IMAP/SMTP/Turso) |
| Watchtower non aggiorna nulla | manca `image: ghcr.io/...` oppure la label `com.centurylinklabs.watchtower.enable=true`; package GHCR privato senza login |
| Push GHCR fallito con *"must be lowercase"* | rinominare il repository GitHub in minuscolo |
| Allegati non trovati dopo rebuild | verificare il volume `./uploads:/app/uploads` |
| Log IMAP/worker | `docker compose logs ticket-dashboard \| findstr IMAP` |
| Entra nel container | `docker exec -it ticket-dashboard sh` |
| Riavvio pulito | `docker compose restart ticket-dashboard` |
