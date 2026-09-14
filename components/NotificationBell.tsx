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

  // Close on outside click
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
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
        className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        title="Notifiche"
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifiche</h3>
            {count > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Segna tutte come lette
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">Caricamento...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Nessuna notifica
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${
                    !n.letta ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    n.tipo === "nuovo_ticket" ? "bg-green-100" : "bg-slate-100"
                  }`}>
                    {n.tipo === "nuovo_ticket" ? (
                      <TicketIcon className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!n.letta ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {n.titolo}
                      </p>
                      {!n.letta && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.messaggio}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{formatTime(n.data_creazione)}</span>
                      {n.ticket_id && (
                        <a
                          href={`/tickets/${n.ticket_id}`}
                          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                          className="text-[10px] font-medium text-blue-500 hover:underline"
                        >
                          Vedi ticket
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.letta && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="mt-1 shrink-0 rounded p-0.5 text-slate-300 hover:text-slate-500"
                      title="Segna come letta"
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
