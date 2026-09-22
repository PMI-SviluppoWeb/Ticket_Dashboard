# Deploy con Docker

## Prerequisiti sul Server Windows

### 1. Installare Docker Desktop
1. Scaricare Docker Desktop da https://www.docker.com/products/docker-desktop/
2. Installare con supporto WSL2 (consigliato) o Hyper-V
3. Riavviare il server dopo l'installazione
4. Verificare l'installazione: `docker --version`

### 2. Installare Git
1. Scaricare Git da https://git-scm.com/download/win
2. Installare con le opzioni predefinite

## Setup iniziale

### 1. Clonare il repository
```powershell
cd C:\Users\Mirko Pandolfi\Desktop
git clone https://github.com/TUO-USERNAME/App-Ticket-Dashboard.git
cd App-Ticket-Dashboard
```

### 2. Configurare le variabili d'ambiente
```powershell
Copy-Item .env.docker.example .env
# Editare .env con i dati reali
notepad .env
```

**Nota importante per SQL Server Windows Auth:**
Il container Docker Linux NON supporta Windows Authentication. Per la sync clienti serve usare SQL Server Authentication (utente/password).

### 3. Primo build e avvio
```powershell
docker-compose up -d --build
```

### 4. Verificare che funzioni
```powershell
docker-compose ps
docker-compose logs ticket-dashboard
```

L'app sarà disponibile su `http://localhost:3001`

## Auto-deploy con GitHub Actions + Watchtower

### Configurare GitHub
1. Creare un repository su GitHub (privato consigliato)
2. Pushare il codice:
```powershell
git remote add origin https://github.com/TUO-USERNAME/App-Ticket-Dashboard.git
git branch -M main
git push -u origin main
```

### Watchtower (già incluso in docker-compose.yml)
Watchtower monitora automaticamente il container `ticket-dashboard` e aggiorna l'immagine quando ne viene推送 una nuova su GitHub Container Registry.

Per aggiornare l'applicazione:
1. Fare `git push` da qualsiasi postazione
2. GitHub Actions builda la nuova immagine Docker
3. Watchtower la tira e riavvia il container
4. Zero intervento manuale sul server

## Comandi utili

```powershell
# Visualizzare i log in tempo reale
docker-compose logs -f ticket-dashboard

# Riavviare il container
docker-compose restart ticket-dashboard

# Fermare tutto
docker-compose down

# Ricostruire e riavviare
docker-compose up -d --build

# Verificare lo stato
docker-compose ps
```

## Risoluzione problemi

```powershell
# Log del worker IMAP
docker-compose logs ticket-dashboard | findstr IMAP

# Log di errore generici
docker-compose logs ticket-dashboard | findstr Error

# Entrare nel container per debug
docker exec -it ticket-dashboard sh
```
