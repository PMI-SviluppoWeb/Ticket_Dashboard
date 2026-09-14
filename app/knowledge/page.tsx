"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeDoc, KnowledgeDocRow, KnowledgeLinkItem, KnowledgeLinkInput } from "@/lib/types";
import { LinkIcon, TrashIcon, PlusIcon, ExternalLinkIcon, EditIcon } from "@/components/icons";

const CATEGORIES = [
  { value: "tutte", label: "Tutte" },
  { value: "generale", label: "Generale" },
  { value: "documentazione", label: "Documentazione" },
  { value: "tutorial", label: "Tutorial" },
  { value: "api", label: "API" },
  { value: "risorse", label: "Risorse" },
];

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocRow[]>([]);
  const [links, setLinks] = useState<KnowledgeLinkItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<KnowledgeDoc | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileInputRef] = useState(useRef<HTMLInputElement>(null));
  const requestSeq = useRef(0);

  // Links state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editingLink, setEditingLink] = useState<KnowledgeLinkItem | null>(null);
  const [linkForm, setLinkForm] = useState<KnowledgeLinkInput>({ titolo: "", url: "", descrizione: "", categoria: "generale" });
  const [filterCategoria, setFilterCategoria] = useState("tutte");
  const [linkSearch, setLinkSearch] = useState("");
  const requestSeqLinks = useRef(0);

  // Pagination docs
  const [docPage, setDocPage] = useState(1);
  const DOCS_PER_PAGE = 5;

  // Load docs
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

  // Load links
  const loadLinks = useCallback(async (search?: string) => {
    const seq = ++requestSeqLinks.current;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCategoria && filterCategoria !== "tutte") params.set("categoria", filterCategoria);
    try {
      const res = await fetch(`/api/knowledge/links?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === requestSeqLinks.current) {
        setLinks(data.links as KnowledgeLinkItem[]);
      }
    } catch (err) {
      if (seq === requestSeqLinks.current) {
        setError(err instanceof Error ? err.message : "Errore caricamento link.");
      }
    }
  }, [filterCategoria]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    loadLinks(linkSearch);
  }, [loadLinks, linkSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDocPage(1);
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
        if (!res.ok) throw new Error((data.error as string) ?? "Errore durante l'upload.");
        setQ("");
        await loadDocs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore durante l'upload.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [loadDocs, fileInputRef]
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

  // Link CRUD
  const saveLink = async () => {
    if (!linkForm.titolo.trim() || !linkForm.url.trim()) {
      setError("Titolo e URL sono obbligatori.");
      return;
    }
    setError("");
    try {
      if (editingLink) {
        const res = await fetch(`/api/knowledge/links/${editingLink.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(linkForm),
        });
        if (!res.ok) throw new Error("Errore aggiornamento link");
      } else {
        const res = await fetch("/api/knowledge/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(linkForm),
        });
        if (!res.ok) throw new Error("Errore creazione link");
      }
      setShowLinkForm(false);
      setEditingLink(null);
      setLinkForm({ titolo: "", url: "", descrizione: "", categoria: "generale" });
      await loadLinks(linkSearch);
    } catch {
      setError("Impossibile salvare il link.");
    }
  };

  const deleteLink = async (link: KnowledgeLinkItem) => {
    if (!window.confirm(`Eliminare "${link.titolo}" dalla knowledge base?`)) return;
    try {
      const res = await fetch(`/api/knowledge/links/${link.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      await loadLinks(linkSearch);
    } catch {
      setError("Impossibile eliminare il link.");
    }
  };

  const startEditLink = (link: KnowledgeLinkItem) => {
    setEditingLink(link);
    setLinkForm({ titolo: link.titolo, url: link.url, descrizione: link.descrizione ?? "", categoria: link.categoria });
    setShowLinkForm(true);
  };

  const startNewLink = () => {
    setEditingLink(null);
    setLinkForm({ titolo: "", url: "", descrizione: "", categoria: "generale" });
    setShowLinkForm(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Knowledge Base</h1>
          <p className="text-xs text-slate-500">
            Documenti PDF e link utili · {docs.length} documenti · {links.length} link
          </p>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
        )}

        {/* ==================== DOCUMENTI PDF ==================== */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700 uppercase tracking-wide">Documenti PDF</h2>

          <form onSubmit={handleSearch} className="flex items-center gap-2 mb-3">
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
                onClick={() => { setQ(""); setDocPage(1); loadDocs(); }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            )}
          </form>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
              dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white"
            }`}
          >
            <p className="text-sm font-medium text-slate-700">Trascina qui un PDF oppure</p>
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
            <p className="text-xs text-slate-400">Il testo estratto viene salvato nel database.</p>
          </div>

          {loading && docs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Caricamento documenti…</p>
          ) : docs.length === 0 ? (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-6 py-8 text-center">
              <p className="text-sm text-slate-500">
                {q ? "Nessun documento trovato." : "Nessun documento PDF. Importa un PDF per iniziare."}
              </p>
            </div>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-2">
                {docs.slice((docPage - 1) * DOCS_PER_PAGE, docPage * DOCS_PER_PAGE).map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-600">PDF</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{doc.nome_file}</p>
                      <p className="text-xs text-slate-500">
                        {formatSize(doc.dimensione)}
                        {doc.pagine != null ? ` · ${doc.pagine} ${doc.pagine === 1 ? "pagina" : "pagine"}` : ""}
                        {" · "}{doc.data_creazione}
                      </p>
                      {doc.links && doc.links.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                          <LinkIcon className="h-3 w-3" />
                          <span>{doc.links.length} link collegati</span>
                        </div>
                      )}
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
              {(() => {
                const totalPages = Math.ceil(docs.length / DOCS_PER_PAGE);
                if (totalPages <= 1) return null;
                return (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={docPage === 1}
                      onClick={() => setDocPage((p) => p - 1)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-slate-500">
                      Pagina {docPage} di {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={docPage === totalPages}
                      onClick={() => setDocPage((p) => p + 1)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </section>

        {/* ==================== LINK DI RIFERIMENTO ==================== */}
        <section className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Link di Riferimento</h2>
            <button
              type="button"
              onClick={startNewLink}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <PlusIcon className="h-3 w-3" />
              Nuovo Link
            </button>
          </div>

          {/* Filter row */}
          <div className="mb-3 flex items-center gap-2">
            <input
              type="search"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Cerca link…"
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
            />
            <div className="flex gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFilterCategoria(cat.value)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filterCategoria === cat.value
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Link Form */}
          {showLinkForm && (
            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <h3 className="mb-2 text-xs font-bold text-slate-700">
                {editingLink ? "Modifica Link" : "Aggiungi Nuovo Link"}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={linkForm.titolo}
                  onChange={(e) => setLinkForm((f) => ({ ...f, titolo: e.target.value }))}
                  placeholder="Titolo (es. Documentazione API)"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="url"
                  value={linkForm.url}
                  onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://esempio.com/documentazione"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                />
                <input
                  type="text"
                  value={linkForm.descrizione ?? ""}
                  onChange={(e) => setLinkForm((f) => ({ ...f, descrizione: e.target.value }))}
                  placeholder="Descrizione (opzionale)"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                />
                <select
                  value={linkForm.categoria}
                  onChange={(e) => setLinkForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                >
                  {CATEGORIES.filter((c) => c.value !== "tutte").map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveLink}
                  disabled={!linkForm.titolo.trim() || !linkForm.url.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingLink ? "Aggiorna" : "Salva"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLinkForm(false); setEditingLink(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Links list */}
          {links.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center">
              <p className="text-sm text-slate-500">
                {linkSearch || filterCategoria !== "tutte"
                  ? "Nessun link trovato per i filtri selezionati."
                  : "Nessun link aggiunto. Clicca \"Nuovo Link\" per inserire risorse utili."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <LinkIcon className="h-4 w-4 text-blue-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{link.titolo}</p>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {link.categoria}
                      </span>
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate block"
                    >
                      {link.url}
                    </a>
                    {link.descrizione && (
                      <p className="mt-0.5 text-[11px] text-slate-400 truncate">{link.descrizione}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-400">{link.data_creazione}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      title="Apri link"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => startEditLink(link)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Modifica"
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLink(link)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Elimina"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Document detail modal */}
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
                  {" · "}{selected.data_creazione}
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