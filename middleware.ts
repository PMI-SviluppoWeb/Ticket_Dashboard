import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@/lib/auth";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

// Elenco ESPLICITO delle route pubbliche. Prima erano prefissi
// ("/api/auth/", "/api/hooks/"): una nuova route sotto quei prefissi nasceva
// pubblica per sbaglio. Ora una route e' pubblica solo se compare qui.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/register",
  "/api/hooks/email",
  // Ritorno da Google: non puo' passare dalla sessione (una sessione scaduta
  // durante il consenso sprecherebbe il codice monouso). La protezione e' il
  // confronto state + PKCE col cookie HttpOnly di /api/gmail/connect.
  "/api/gmail/callback",
]);

function isPublicPath(pathname: string): boolean {
  // API macchina (bot WhatsApp): autenticata con Authorization: Bearer e una
  // chiave API, non con la sessione del browser. E' un namespace separato e
  // volutamente pubblico a livello di middleware.
  if (pathname.startsWith("/api/esterni/")) return true;
  return PUBLIC_PATHS.has(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin") ?? "";

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (ALLOWED_ORIGINS.has(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.headers.set("Access-Control-Max-Age", "86400");
    }
    return res;
  }

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    if (ALLOWED_ORIGINS.has(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    return response;
  }

  const token = request.cookies.get("session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifyJWT(token);
  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessione scaduta" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("session");
    return response;
  }

  // Le intestazioni x-operator-* NON vengono piu' emesse: erano fidate da
  // tutte le route e forgiabili se il middleware venisse aggirato. Ogni route
  // usa richiediOperatore(), che rilegge la sessione e l'operatore dal DB.
  const response = NextResponse.next();
  if (ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

export const config = {
  matcher: [
    // Le API passano SEMPRE dal middleware, anche se il percorso termina con
    // un'estensione (prima il filtro sulle estensioni poteva saltarle).
    "/api/:path*",
    // Pagine e asset: si escludono solo le cartelle statiche di Next e i file
    // con estensione serviti da /public.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
