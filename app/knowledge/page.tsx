"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeDoc, KnowledgeDocRow, KnowledgeLinkItem, KnowledgeLinkInput } from "@/lib/types";
import { LinkIcon, TrashIcon, PlusIcon, ExternalLinkIcon, EditIcon, BookIcon } from "@/components/icons";
import AppHeader from "@/components/AppHeader";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";

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
      <AppHeader />

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <PageHeader
          eyebrow="Area di lavoro"
          titolo="Knowledge Base"
          sottotitolo={`Documenti PDF e link utili · ${docs.length} documenti · ${links.length} link.`}
        />

        {error && (
          <p className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo">{error}</p>
        )}

        {/* ==================== DOCUMENTI PDF ==================== */}
        <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Documenti PDF" icona={BookIcon} conteggio={docs.length} />

          <div className="border-b border-crema-bordo px-5 py-3">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca nei documenti…"
                className="w-full max-w-md rounded-full border border-crema-contorno bg-white px-3 py-1.5 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
              <button
                type="submit"
                className="cursor-pointer rounded-control bg-inchiostro px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
              >
                Cerca
              </button>
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setDocPage(1); loadDocs(); }}
                  className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Reset
                </button>
              )}
            </form>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-6 text-center transition-colors duration-200 ${
              dragging ? "border-inchiostro bg-crema-scuro" : "border-crema-contorno bg-white"
            }`}
          >
            <p className="text-sm font-medium text-inchiostro">Trascina qui un PDF oppure</p>
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
              className="cursor-pointer rounded-control bg-inchiostro px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Importazione in corso…" : "Scegli un file PDF"}
            </button>
            <p className="text-xs text-caldo-testo">Il testo estratto viene salvato nel database.</p>
          </div>

          {loading && docs.length === 0 ? (
            <p className="py-6 text-center text-sm text-caldo-testo">Caricamento documenti…</p>
          ) : docs.length === 0 ? (
            <div className="mt-2 rounded-card border border-crema-contorno bg-white px-6 py-8 text-center">
              <p className="text-sm text-caldo-testo">
                {q ? "Nessun documento trovato." : "Nessun documento PDF. Importa un PDF per iniziare."}
              </p>
            </div>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-2">
                {docs.slice((docPage - 1) * DOCS_PER_PAGE, docPage * DOCS_PER_PAGE).map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-crema-contorno bg-white px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Il tipo di file non e' uno stato: e' un'etichetta di
                        formato, quindi va in tinta neutra, non in rosso.
                        Il rosso qui griderebbe "errore" su un PDF valido. */}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-stato-neutro-bordo bg-stato-neutro-bg text-xs font-bold text-stato-neutro-testo">PDF</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-inchiostro">{doc.nome_file}</p>
                      <p className="text-xs text-caldo-testo">
                        {formatSize(doc.dimensione)}
                        {doc.pagine != null ? ` · ${doc.pagine} ${doc.pagine === 1 ? "pagina" : "pagine"}` : ""}
                        {" · "}{doc.data_creazione}
                      </p>
                      {doc.links && doc.links.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-caldo-testo">
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
                      className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                    >
                      Leggi
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc)}
                      className="cursor-pointer rounded-control border border-stato-urgenza-bordo px-3 py-1 text-xs font-medium text-stato-urgenza-testo transition-colors duration-200 hover:bg-stato-urgenza-bg"
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
                      className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="tabular text-xs text-caldo-testo">
                      Pagina {docPage} di {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={docPage === totalPages}
                      onClick={() => setDocPage((p) => p + 1)}
                      className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-40"
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
        <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Link di Riferimento" icona={LinkIcon} conteggio={links.length}>
            <button
              type="button"
              onClick={startNewLink}
              className="flex cursor-pointer items-center gap-1.5 rounded-control bg-inchiostro px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
            >
              <PlusIcon className="h-3 w-3" />
              Nuovo Link
            </button>
          </SectionBar>

          {/* Filter row */}
          <div className="mb-3 flex items-center gap-2 px-5 pt-3">
            <input
              type="search"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Cerca link…"
              className="w-full max-w-xs rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            />
            <div className="flex gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFilterCategoria(cat.value)}
                  className={`cursor-pointer rounded-control px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 ${
                    filterCategoria === cat.value
                      ? "bg-inchiostro text-white"
                      : "border border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Link Form */}
          {showLinkForm && (
            <div className="mb-3 rounded-card border border-crema-contorno bg-crema-scuro p-4">
              <h3 className="mb-2 text-xs font-bold text-inchiostro">
                {editingLink ? "Modifica Link" : "Aggiungi Nuovo Link"}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={linkForm.titolo}
                  onChange={(e) => setLinkForm((f) => ({ ...f, titolo: e.target.value }))}
                  placeholder="Titolo (es. Documentazione API)"
                  className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
                <input
                  type="url"
                  value={linkForm.url}
                  onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://esempio.com/documentazione"
                  className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
                <input
                  type="text"
                  value={linkForm.descrizione ?? ""}
                  onChange={(e) => setLinkForm((f) => ({ ...f, descrizione: e.target.value }))}
                  placeholder="Descrizione (opzionale)"
                  className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
                <select
                  value={linkForm.categoria}
                  onChange={(e) => setLinkForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="cursor-pointer rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
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
                  className="cursor-pointer rounded-control bg-inchiostro px-4 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingLink ? "Aggiorna" : "Salva"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLinkForm(false); setEditingLink(null); }}
                  className="cursor-pointer rounded-control border border-crema-contorno bg-white px-4 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Links list */}
          {links.length === 0 ? (
            <div className="rounded-card border border-crema-contorno bg-white px-6 py-8 text-center">
              <p className="text-sm text-caldo-testo">
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
                  className="flex items-center gap-3 rounded-card border border-crema-contorno bg-white px-4 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-crema-scuro">
                    <LinkIcon className="h-4 w-4 text-caldo-testo" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-inchiostro">{link.titolo}</p>
                      <span className="shrink-0 rounded-full border border-stato-neutro-bordo bg-stato-neutro-bg px-2 py-0.5 text-[10px] font-medium text-stato-neutro-testo">
                        {link.categoria}
                      </span>
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block cursor-pointer truncate text-xs text-caldo-testo underline-offset-2 transition-colors duration-200 hover:text-inchiostro hover:underline"
                    >
                      {link.url}
                    </a>
                    {link.descrizione && (
                      <p className="mt-0.5 truncate text-[11px] text-caldo-testo">{link.descrizione}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-caldo-testo">{link.data_creazione}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                      title="Apri link"
                      aria-label={`Apri ${link.titolo} in una nuova scheda`}
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => startEditLink(link)}
                      className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                      title="Modifica"
                      aria-label={`Modifica ${link.titolo}`}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLink(link)}
                      className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-urgenza-bordo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                      title="Elimina"
                      aria-label={`Elimina ${link.titolo}`}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-crema-contorno bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-crema-bordo px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-inchiostro">{selected.nome_file}</p>
                <p className="text-xs text-caldo-testo">
                  {formatSize(selected.dimensione)}
                  {selected.pagine != null ? ` · ${selected.pagine} pagine` : ""}
                  {" · "}{selected.data_creazione}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(selected.testo)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Copia testo
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Chiudi
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-relaxed text-inchiostro">
              {selected.testo}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}