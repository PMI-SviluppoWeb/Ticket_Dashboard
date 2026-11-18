import { NextResponse } from "next/server";
import {
  costruisciUrlConnect,
  credenzialiGmailPresenti,
  generaCodeVerifier,
  generaState,
} from "@/lib/gmail-oauth";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Durata del cookie OAuth (state + PKCE verifier): il consenso su Google di
// solito richiede meno di questo, ma un utente lento non deve perdere il
// collegamento a meta'.
const COOKIE_TTL_SEC = 600;

// Stesso criterio di /api/caselle: solo amministratori.
async function richiediAdmin(request: Request): Promise<NextResponse | null> {
  const esito = await richiediOperatore(request, { ruolo: "admin" });
  return esito.ok ? null : esito.risposta;
}

// GET /api/gmail/connect → genera state + code_verifier, li memorizza in un
// cookie HttpOnly e reindirizza l'utente alla schermata ufficiale di consenso
// di Google. Da li' in poi l'utente non tocca piu' nulla: nessuna porta,
// nessun server, nessuna password (zero-configuration).
export async function GET(request: Request) {
  const negato = await richiediAdmin(request);
  if (negato) return negato;

  if (!credenzialiGmailPresenti()) {
    return NextResponse.json(
      { error: "GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET non configurate." },
      { status: 503 }
    );
  }

  try {
    const state = generaState();
    const verifier = generaCodeVerifier();
    const url = await costruisciUrlConnect(state, verifier);

    const response = NextResponse.redirect(url, 302);
    response.cookies.set("gmail_oauth", JSON.stringify({ state, v: verifier }), {
      httpOnly: true,
      sameSite: "lax",
      // Secure solo in produzione: in dev su http://localhost il flag
      // impedirebbe l'invio del cookie al ritorno da Google.
      secure: process.env.NODE_ENV === "production",
      path: "/api/gmail",
      maxAge: COOKIE_TTL_SEC,
    });
    return response;
  } catch (err) {
    console.error("GET /api/gmail/connect", err);
    return NextResponse.redirect("/admin/email?gmail=errore", 302);
  }
}
