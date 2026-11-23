import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";
import { pollOnce as pollImap } from "@/lib/imap-worker";
import { pollOnce as pollGmail } from "@/lib/gmail-worker";

export const dynamic = "force-dynamic";
// Il controllo apre IMAP/Gmail e puo' richiedere qualche secondo.
export const maxDuration = 60;

// Controllo manuale della posta: utile subito dopo aver collegato una casella,
// senza aspettare il ciclo del worker. Admin-only.
export async function POST(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const [imap, gmail] = await Promise.allSettled([pollImap(), pollGmail()]);

  return NextResponse.json({
    ok: imap.status === "fulfilled" && gmail.status === "fulfilled",
    imap: imap.status === "fulfilled" ? "ok" : "errore",
    gmail: gmail.status === "fulfilled" ? "ok" : "errore",
  });
}
