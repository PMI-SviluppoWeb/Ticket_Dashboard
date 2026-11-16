import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { getCasella, credenzialiCasella, credenzialiGmail } from "@/lib/caselle";
import { ErroreGmail, ottieniAccessToken, profiloGmail } from "@/lib/gmail-oauth";

export const dynamic = "force-dynamic";

// Verifica che le credenziali di una casella funzionino davvero: apre una
// sessione IMAP e fa un `verify()` SMTP. Utile subito dopo il salvataggio,
// prima che il worker provi a collegarsi da solo.
// Per le caselle Gmail (OAuth) verifica invece il refresh token con una
// richiesta di access token + getProfile.
//
// Accetta un body opzionale con `password` per provare una password NUOVA
// non ancora salvata (la form la invia solo quando e' stata modificata).

function richiediAdmin(request: Request): NextResponse | null {
  if (!request.headers.get("x-operator-id")) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (request.headers.get("x-operator-ruolo") !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

// Test per una casella Gmail: refresh grant + getProfile. Se Google accetta
// il refresh token, il collegamento funziona.
async function testGmail(id: string): Promise<NextResponse> {
  const cred = await credenzialiGmail(id);
  if (!cred) {
    return NextResponse.json(
      { error: "Refresh token non disponibile (collega di nuovo l'account Gmail)." },
      { status: 400 }
    );
  }
  try {
    const accessToken = await ottieniAccessToken(cred.refreshToken);
    const profilo = await profiloGmail(accessToken);
    return NextResponse.json({
      ok: true,
      gmail: { ok: true, indirizzo: profilo.emailAddress },
    });
  } catch (err) {
    const messaggio =
      err instanceof ErroreGmail
        ? err.message
        : err instanceof Error
          ? err.message
          : "Errore sconosciuto.";
    return NextResponse.json({
      ok: false,
      gmail: { ok: false, errore: messaggio },
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const casella = await getCasella(params.id);
    if (!casella) {
      return NextResponse.json({ error: "Casella non trovata." }, { status: 404 });
    }

    // Casella collegata via OAuth: nessun IMAP/SMTP da provare.
    if (casella.tipo === "gmail") {
      return testGmail(params.id);
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string };

    // Password da provare: quella del body (non salvata) oppure quella
    // cifrata in DB.
    let pass: string;
    if (typeof body.password === "string" && body.password.length > 0) {
      pass = body.password;
    } else {
      const cred = await credenzialiCasella(params.id);
      if (!cred) {
        return NextResponse.json(
          { error: "Password della casella non disponibile (ENCRYPTION_KEY cambiata?)." },
          { status: 400 }
        );
      }
      pass = cred.smtp.pass;
    }

    // 1. IMAP: connect + logout. Il timeout evita che la richiesta resti
    // appesa su un host che non risponde.
    let imapOk = false;
    let imapErrore: string | null = null;
    const client = new ImapFlow({
      host: casella.imap_host,
      port: casella.imap_port,
      secure: casella.imap_secure,
      auth: { user: casella.utente, pass },
      logger: false,
      tls: { rejectUnauthorized: false },
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    try {
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (err) {
      imapErrore = err instanceof Error ? err.message : "Errore IMAP sconosciuto.";
    }

    // 2. SMTP: verify() apre un socket, fa l'ehlo/close e chiude.
    let smtpOk = false;
    let smtpErrore: string | null = null;
    const transporter = nodemailer.createTransport({
      host: casella.smtp_host,
      port: casella.smtp_port,
      secure: casella.smtp_secure,
      auth: { user: casella.utente, pass },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
      tls: { rejectUnauthorized: false },
    });
    try {
      await transporter.verify();
      smtpOk = true;
    } catch (err) {
      smtpErrore = err instanceof Error ? err.message : "Errore SMTP sconosciuto.";
    }

    if (imapOk && smtpOk) {
      return NextResponse.json({ ok: true, imap: { ok: true }, smtp: { ok: true } });
    }
    return NextResponse.json({
      ok: false,
      imap: { ok: imapOk, errore: imapErrore },
      smtp: { ok: smtpOk, errore: smtpErrore },
    });
  } catch (err) {
    console.error("POST /api/caselle/[id]/test", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
