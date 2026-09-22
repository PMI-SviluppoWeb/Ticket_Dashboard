# Guida: Passaggio da SQL Server a API Arca per Anagrafiche Clienti

## Contesto attuale

La sincronizzazione anagrafiche clienti è attualmente configurata per leggere dati direttamente da SQL Server (`lib/sync/config.ts` con `source: "sql-server"`).

Quando le API Arca saranno attive, segue la procedura per passare alla modalità API.

---

## Step 1: Configurare le variabili d'ambiente

Aggiungere a `.env.local`:

```
ARCA_API_BASE_URL=http://tuoserver/api
ARCA_API_KEY=la-tua-api-key
```

---

## Step 2: Modificare la configurazione

Aprire `lib/sync/config.ts` e cambiare:

```typescript
// Prima (SQL Server)
source: "sql-server",

// Dopo (API)
source: "api",
```

---

## Step 3: Implementare la funzione API

Aprire `lib/sync/sources/api-source.ts` e implementare la funzione `fetchClientiFromApi()`.

### Esempio di implementazione

La funzione deve:
1. Chiamare l'endpoint REST di Arca
2. Autenticarsi con Bearer token
3. Restituire un array di oggetti con i campi grezzi

```typescript
export async function fetchClientiFromApi(): Promise<ClienteFromApi[]> {
  const { baseUrl, endpoint } = syncConfig.api;
  const apiKey = process.env.ARCA_API_KEY || "";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Adattare in base al formato di risposta dell'API Arca
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object" && "data" in data) {
    return data.data;
  }

  throw new Error("Formato risposta API non riconosciuto");
}
```

### Note importanti

- La funzione deve restituire un array di oggetti
- I nomi dei campi nell'oggetto devono corrispondere ai valori nel `fieldMap` della configurazione
- Controllare la documentazione API Arca per il formato esatto della risposta

---

## Step 4: Aggiornare il fieldMap (se necessario)

Se i nomi dei campi nell'API Arca sono diversi da quelli di SQL Server, aggiornare `fieldMap` in `lib/sync/config.ts`:

```typescript
fieldMap: {
  ragione_sociale: "NomeCampoAPI",  // es. "denominazione" o "ragioneSociale"
  telefono: "Telefono",             // es. "telefonoPrincipale"
  // ... altri campi
},
```

---

## Step 5: Testare

```bash
npm run sync-clienti
```

Verificare che:
- La connessione API funzioni
- I dati vengano mappati correttamente
- I clienti vengano inseriti/aggiornati in Turso

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Errore 401/403 | Verificare che `ARCA_API_KEY` sia corretta in `.env.local` |
| Campi mancanti | Controllare che il `fieldMap` corrisponda ai campi dell'API |
| Formato risposta errato | Verificare la documentazione API e adattare il parsing |
| Nessun dato restituito | Verificare l'endpoint URL e i parametri della query |

---

## Note tecniche

- Lo script sync è in `lib/sync/` con struttura modulare
- `sources/sql-server-source.ts` → sorgente SQL Server
- `sources/api-source.ts` → sorgente API (da implementare)
- `sync-clienti.ts` → logica upsert che funziona con entrambe le sorgenti
- Il cambio sorgente richiede solo modifiche alla configurazione e all'API source
