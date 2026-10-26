"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon, CheckCircleIcon, TicketIcon } from "@/components/icons";

interface Notification {
  id: string;
  titolo: string;
  messaggio: string;
  ticket_id: string | null;
  tipo: string;
  letta: boolean;
  data_creazione: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const seqRef = useRef(0);

  const fetchNotifications = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      if (seq === seqRef.current) {
        setNotifications(data.notifications);
        setCount(data.count);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?count=true");
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.count);
    } catch {
      // ignore
    }
  }, []);

  // Poll count every 15 seconds
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Load full list when opening
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  // Close on outside click and on Escape.
  // Escape non e' un extra: un pannello che si apre col mouse ma si chiude
  // solo col mouse e' inutilizzabile da tastiera.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, letta: true } : n)));
      setCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, letta: true })));
      setCount(0);
    } catch {
      // ignore
    }
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Adesso";
    if (diffMin < 60) return `${diffMin}m fa`;
    const diffOre = Math.floor(diffMin / 60);
    if (diffOre < 24) return `${diffOre}h fa`;
    const diffGiorni = Math.floor(diffOre / 24);
    return `${diffGiorni}g fa`;
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white text-inchiostro shadow-soft ring-1 ring-crema-contorno duration-200 hover:bg-lime"
        title="Notifiche"
        aria-label={count > 0 ? `Notifiche, ${count} non lette` : "Notifiche"}
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 && (
          // Il contatore e' in inchiostro, non in rosso: e' un numero di
          // elementi in attesa, non un errore. Il rosso in questa palette
          // segnala urgenza reale.
          <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-inchiostro px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-panel border border-crema-contorno bg-white shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-crema-bordo px-4 py-3">
            <h3 className="text-sm font-semibold text-inchiostro">Notifiche</h3>
            {count > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="cursor-pointer text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro hover:underline"
              >
                Segna tutte come lette
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-caldo-testo">Caricamento…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-inchiostro">Nessuna notifica</p>
                <p className="mt-1 text-xs text-caldo-testo">
                  Qui arrivano gli aggiornamenti sui ticket.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-crema-bordo px-4 py-3 transition-colors duration-200 hover:bg-crema-scuro ${
                    !n.letta ? "bg-crema-scuro/60" : ""
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      n.tipo === "nuovo_ticket"
                        ? "border-stato-info-bordo bg-stato-info-bg"
                        : "border-stato-ok-bordo bg-stato-ok-bg"
                    }`}
                  >
                    {n.tipo === "nuovo_ticket" ? (
                      <TicketIcon className="h-3.5 w-3.5 text-stato-info-testo" />
                    ) : (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-stato-ok-testo" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm text-inchiostro ${
                          !n.letta ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {n.titolo}
                      </p>
                      {!n.letta && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-inchiostro"
                          aria-label="Non letta"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-caldo-testo">{n.messaggio}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="tabular text-[10px] text-caldo-testo/80">
                        {formatTime(n.data_creazione)}
                      </span>
                      {n.ticket_id && (
                        <a
                          href={`/tickets/${n.ticket_id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                          }}
                          className="text-[10px] font-medium text-inchiostro underline-offset-2 hover:underline"
                        >
                          Vedi ticket
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.letta && (
                    <button
                      type="button"
                      onClick={() => markAsRead(n.id)}
                      className="mt-1 shrink-0 cursor-pointer rounded p-0.5 text-caldo-testo/60 transition-colors duration-200 hover:text-inchiostro"
                      title="Segna come letta"
                      aria-label="Segna come letta"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
