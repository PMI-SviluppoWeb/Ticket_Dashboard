import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  ErroreGmail,
  profiloGmail,
  scambiaCodice,
} from "@/lib/gmail-oauth";
import { collegaGmail } from "@/lib/caselle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// URI di ritorno dopo il consenso Google. E' un endpoint PUBBLICO (come
// /api/hooks/*): la protezione e' il confronto state + PKCE col cookie
// HttpOnly impostato da /api/gmail/connect, non la sessione — altrimenti una
// sessione scaduta durante il consenso sprecerebbe il codice di un solo uso.
const REDIRECT_OK = "/admin/email?gmail=ok";
const REDIRECT_ERRORE = "/admin/email?gmail=errore";

function leggiCookieOAuth(request: Request): { state: string; v: string } | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw.match(/(?:^|;\s*)gmail_oauth=([^;]+)/);
  if (!match) return null;
  try {
    const valore = JSON.parse(decodeURIComponent(match[1])) as { state?: unknown; v?: unknown };
    if (typeof valore.state !== "string" || typeof valore.v !== "string") return null;
    return { state: valore.state, v: valore.v };
  } catch {
    return null;
  }
}

function confrontaUguali(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// GET /api/gmail/callback — Redirect URI registrato su Google Cloud Console.
// Scambia il codice di autorizzazione con Access/Refresh Token, memorizza il
// Refresh Token cifrato nel DB e riporta l'utente sulla pagina caselle.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erroreGoogle = url.searchParams.get("error");

  const cookie = leggiCookieOAuth(request);
  // Il cookie viene azzerato SEMPRE: il codice e' monouso, riusarlo non ha
  // senso e un callback rigenerato deve rifare tutto il flusso.
  const pulisci = (redirect: string): NextResponse => {
    const res = NextResponse.redirect(new URL(redirect, url.origin), 302);
    // Il path deve coincide con quello usato in /api/gmail/connect:
    // con un path diverso il browser non cancellerebbe il cookie.
    res.cookies.delete({ name: "gmail_oauth", path: "/api/gmail" });
    return res;
  };

  if (erroreGoogle) {
    // L'utente ha rifiutato il consenso (o Google ha rifiutato la richiesta).
    console.warn(`[gmail] Consenso non concesso: ${erroreGoogle}`);
    return pulisci(`${REDIRECT_ERRORE}&motivo=${encodeURIComponent("consenso_rifiutato")}`);
  }
  if (!code || !state) {
    return pulisci(`${REDIRECT_ERRORE}&motivo=parametri_mancanti`);
  }
  if (!cookie || !confrontaUguali(cookie.state, state)) {
    // State non corrispondente: CSRF o cookie perso. Si rifiuta.
    return pulisci(`${REDIRECT_ERRORE}&motivo=state_non_valido`);
  }

  try {
    const token = await scambiaCodice(code, cookie.v);
    if (!token.refresh_token) {
      // Con prompt=consent Google lo restituisce sempre; se manca, il
      // collegamento non sarebbe persistente: si rifiuta invece di salvare
      // una casella che si spegnerebbe al primo scadenza access token.
      console.error("[gmail] Risposta di Google senza refresh_token.");
      return pulisci(`${REDIRECT_ERRORE}&motivo=refresh_token_mancante`);
    }

    const profilo = await profiloGmail(token.access_token);
    const esito = await collegaGmail({
      indirizzo: profilo.emailAddress,
      refreshToken: token.refresh_token,
    });
    if (!esito.ok) {
      console.error("[gmail] Salvataggio casella fallito:", esito.error);
      return pulisci(`${REDIRECT_ERRORE}&motivo=${encodeURIComponent("salvataggio_fallito")}`);
    }

    console.log(`[gmail] Account ${profilo.emailAddress} collegato (casella ${esito.id}).`);
    return pulisci(`${REDIRECT_OK}&indirizzo=${encodeURIComponent(profilo.emailAddress)}`);
  } catch (err) {
    if (err instanceof ErroreGmail) {
      console.error(`[gmail] Errore OAuth (${err.status}): ${err.message}`);
      return pulisci(`${REDIRECT_ERRORE}&motivo=${encodeURIComponent(err.message.slice(0, 80))}`);
    }
    console.error("GET /api/gmail/callback", err);
    return pulisci(`${REDIRECT_ERRORE}&motivo=errore_interno`);
  }
}
