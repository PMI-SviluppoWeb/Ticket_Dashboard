"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeDoc, KnowledgeDocRow } from "@/lib/types";

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<KnowledgeDoc | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  const loadDocs = useCallback(async (search?: string) => {
    const seq = ++requestSeq.current;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/knowledge?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === requestSeq.current) {
        setDocs(data.docs as KnowledgeDocRow[]);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocs(q.trim());
  };

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError("");
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/knowledge", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error((data.error as string) ?? "Errore durante l'upload.");
        }
        setQ("");
        await loadDocs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore durante l'upload.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [loadDocs]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const openDoc = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/${id}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setSelected((await res.json()) as KnowledgeDoc);
    } catch {
      setError("Impossibile aprire il documento.");
    }
  };

  const deleteDoc = async (doc: KnowledgeDocRow) => {
    if (!window.confirm(`Eliminare "${doc.nome_file}" dalla knowledge base?`)) return;
    try {
      const res = await fetch(`/api/knowledge/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      if (selected?.id === doc.id) setSelected(null);
      await loadDocs(q.trim());
    } catch {
      setError("Impossibile eliminare il documento.");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Knowledge Base</h1>
            <p className="text-xs text-slate-500">
              Documenti PDF importati, consultabili anche via MCP · {docs.length} documenti
            </p>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca nei documenti…"
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Cerca
          </button>
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                loadDocs();
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          )}
        </form>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white"
          }`}
        >
          <p className="text-sm font-medium text-slate-700">
            Trascina qui un PDF oppure
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? "Importazione in corso…" : "Scegli un file PDF"}
          </button>
          <p className="text-xs text-slate-400">
            Il testo estratto viene salvato nel database (Turso) e resta consultabile dall'assistente AI.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
        )}

        {loading && docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Caricamento documenti…</p>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
            <p className="text-sm text-slate-500">
              {q ? "Nessun documento trovato per questa ricerca." : "Nessun documento nella knowledge base. Importa un PDF per iniziare."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-600">
                    PDF
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{doc.nome_file}</p>
                    <p className="text-xs text-slate-500">
                      {formatSize(doc.dimensione)}
                      {doc.pagine != null ? ` · ${doc.pagine} ${doc.pagine === 1 ? "pagina" : "pagine"}` : ""}
                      {" · "}
                      {doc.data_creazione}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openDoc(doc.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Leggi
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDoc(doc)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Elimina
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{selected.nome_file}</p>
                <p className="text-xs text-slate-500">
                  {formatSize(selected.dimensione)}
                  {selected.pagine != null ? ` · ${selected.pagine} pagine` : ""}
                  {" · "}
                  {selected.data_creazione}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(selected.testo)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Copia testo
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Chiudi
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-relaxed text-slate-700">
              {selected.testo}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
