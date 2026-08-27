import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// L'app "Ticket Assistant" gira su localhost:3000 e invia i ticket
// via browser a questa dashboard (localhost:3001): serve il CORS.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (ALLOWED_ORIGINS.has(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Content-Type");
      res.headers.set("Access-Control-Max-Age", "86400");
    }
    return res;
  }

  const response = NextResponse.next();
  if (ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
