"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  EditIcon,
  LoaderIcon,
  LockClosedIcon,
  MailIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import { useOperatore } from "@/lib/operatore-client";
import type { CasellaEmail, CasellaEmailInput } from "@/lib/types";

type FormData = CasellaEmailInput;

const EMPTY_FORM: FormData = {
  etichetta: "",
  indirizzo: "",
  imap_host: "imap.gmail.com",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_secure: false,
  utente: "",
  password: "",
  abilitata: true,
  predefinita: false,
};

// Esito del rilevamento automatico delle impostazioni di posta.
type ScopertaStato =
  | { fase: "idle" }
  | { fase: "checking" }
  | { fase: "rilevato"; fonte: string; avvertimento?: string }
  | { fase: "gmail"; fonte?: string }
  | { fase: "manuale"; avvertimento?: string };

const FONTE_LABEL: Record<string, string> = {
  nota: "provider noto",
  ispdb: "configurazione pubblica (Thunderbird)",
  mx: "record MX",
  srv: "record DNS SRV",
  guess: "stimata",
};

function CaselleEmailPageContent() {
  const seqRef = useRef(0);
  const searchParams = useSearchParams();

  const [caselle, setCaselle] = useState<CasellaEmail[]>([]);
  const [encryptionOk, setEncryptionOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [esitoTest, setEsitoTest] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Auto-scoperta IMAP/SMTP (stile Outlook): l'utente inserisce solo email
  // e password, i server li trova /api/caselle/scopri. Stati:
  //  - idle:      email non ancora processata (nuova casella: solo suggerimento)
  //  - checking:  richiesta in corso
  //  - rilevato:  server trovati → campi IMAP/SMTP NASCOSTI dal form
  //  - gmail:     provider Gmail → invito a collegare via OAuth (no password)
  //  - manuale:   fallito/stimato → sezione "Impostazioni avanzata" visibile
  const [scoperta, setScoperta] = useState<ScopertaStato>({ fase: "idle" });
  // Email per la quale l'ultima scoperta è stata eseguita: evita richieste
  // duplicate a blur ripetuti e permette di riconoscere email modificate.
  const emailScopertaRef = useRef<string | null>(null);
  // Email iniziale della casella in modifica: se invariata, non si riscatta.
  const emailInizialeRef = useRef<string | null>(null);

  const { operatore: sessione, caricamento: caricamentoSessione } = useOperatore();
  const isAdmin = sessione?.ruolo === "admin";

  const fetchCaselle = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/caselle");
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      if (seq === seqRef.current) {
        setCaselle(data.caselle ?? []);
        setEncryptionOk(Boolean(data.encryption_key_configurata));
      }
    } catch {
      if (seq === seqRef.current) setError("Impossibile caricare le caselle email.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchCaselle();
  }, [isAdmin, fetchCaselle]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Esito del ritorno da Google (callback OAuth): la query viene consumata
  // una volta, poi rimosse dall'URL per non rimostrare il messaggio al
  // refresh della pagina.
  useEffect(() => {
    const esito = searchParams.get("gmail");
    if (!esito) return;
    const params = new URLSearchParams(window.location.search);
    if (esito === "ok") {
      const indirizzo = searchParams.get("indirizzo");
      setSuccess(
        indirizzo
          ? `Account Gmail ${indirizzo} collegato. Il worker inizierà a controllarlo entro un ciclo di polling.`
          : "Account Gmail collegato."
      );
    } else {
      const motivo = searchParams.get("motivo");
      const messaggi: Record<string, string> = {
        consenso_rifiutato: "Consenso di Google rifiutato: nessun account collegato.",
        state_non_valido: "Sessione di collegamento non valida (ricerca di nuovo).",
        refresh_token_mancante: "Google non ha restituito il refresh token: riprova.",
        salvataggio_fallito: "Salvataggio della casella fallito (ENCRYPTION_KEY?).",
        parametri_mancanti: "Risposta di Google incompleta: riprova.",
        errore_interno: "Errore interno durante il collegamento.",
      };
      setError(messaggi[motivo ?? ""] ?? `Collegamento Gmail non riuscito (${motivo ?? "errore"}).`);
    }
    params.delete("gmail");
    params.delete("indirizzo");
    params.delete("motivo");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [searchParams]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setEsitoTest(null);
    setScoperta({ fase: "idle" });
    emailScopertaRef.current = null;
    emailInizialeRef.current = null;
  };

  // Auto-scoperta IMAP/SMTP da un indirizzo email. Ritorna lo stato
  // risultante (e aggiorna form/scoperta per la UI) così handleSubmit può
  // decidere se procedere, mostrare le avanzate o fermarsi su Gmail.
  const eseguiScoperta = useCallback(async (indirizzo: string): Promise<ScopertaStato> => {
    setScoperta({ fase: "checking" });
    const applicaServer = (data: {
      imap: { host: string; port: number; secure: boolean };
      smtp: { host: string; port: number; secure: boolean };
    }) => {
      setForm((f) => ({
        ...f,
        imap_host: data.imap.host,
        imap_port: Number(data.imap.port),
        imap_secure: Boolean(data.imap.secure),
        smtp_host: data.smtp.host,
        smtp_port: Number(data.smtp.port),
        smtp_secure: Boolean(data.smtp.secure),
        // Quasi tutti i provider usano l'indirizzo completo come utente
        // (%EMAILADDRESS% nell'ISPDB): lo si imposta e lo si nasconde.
        utente: f.utente || indirizzo,
      }));
    };

    try {
      const res = await fetch(`/api/caselle/scopri?indirizzo=${encodeURIComponent(indirizzo)}`);
      const data = (await res.json().catch(() => ({}))) as {
        trovato?: boolean;
        gmail?: boolean;
        imap?: { host: string; port: number; secure: boolean };
        smtp?: { host: string; port: number; secure: boolean };
        fonte?: string;
        avvertimento?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "rilevamento fallito");

      if (data.gmail) {
        const stato: ScopertaStato = { fase: "gmail", fonte: data.fonte };
        setScoperta(stato);
        return stato;
      }
      if (data.trovato && data.imap && data.smtp) {
        applicaServer({ imap: data.imap, smtp: data.smtp });
        if (data.fonte === "guess") {
          // Stimato: meglio far vedere i campi con i valori trovati così
          // l'utente può verificarli prima di salvare.
          const stato: ScopertaStato = { fase: "manuale", avvertimento: data.avvertimento };
          setScoperta(stato);
          return stato;
        }
        const stato: ScopertaStato = {
          fase: "rilevato",
          fonte: data.fonte ?? "nota",
          avvertimento: data.avvertimento,
        };
        setScoperta(stato);
        return stato;
      }
      const stato: ScopertaStato = {
        fase: "manuale",
        avvertimento: "Impostazioni non rilevate per questo dominio: inseriscile manualmente.",
      };
      setScoperta(stato);
      return stato;
    } catch {
      const stato: ScopertaStato = {
        fase: "manuale",
        avvertimento: "Rilevamento non riuscito (rete?): inserisci i server manualmente.",
      };
      setScoperta(stato);
      return stato;
    }
  }, []);

  // Scatta quando l'utente finisce di scrivere l'email (blur): se l'email
  // è nuova rispetto all'ultima scoperta, avvia il rilevamento.
  const handleBlurIndirizzo = () => {
    const email = form.indirizzo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    // In modifica, se l'email è quella salvata, i campi attuali sono già
    // corretti: non si riscatta (evita di sovrascrivere con un indovinello).
    if (editingId && email === emailInizialeRef.current) return;
    if (emailScopertaRef.current === email) return;
    emailScopertaRef.current = email;
    void eseguiScoperta(email);
  };

  const handleEdit = (c: CasellaEmail) => {
    // Le caselle Gmail non hanno parametri IMAP/SMTP da modificare: il
    // collegamento si gestisce solo da (ri)collega/disconnetti.
    if (c.tipo === "gmail") {
      setError(
        "Le caselle Gmail si gestiscono con «Collega account Gmail» / «Elimina»: non hanno server o password da modificare."
      );
      return;
    }
    setForm({
      etichetta: c.etichetta,
      indirizzo: c.indirizzo,
      imap_host: c.imap_host,
      imap_port: c.imap_port,
      imap_secure: c.imap_secure,
      smtp_host: c.smtp_host,
      smtp_port: c.smtp_port,
      smtp_secure: c.smtp_secure,
      utente: c.utente,
      password: "",
      abilitata: c.abilitata,
      predefinita: c.predefinita,
    });
    setEditingId(c.id);
    setShowForm(true);
    setEsitoTest(null);
    // In modifica i campi avanzati restano visibili (valori già salvati);
    // se l'utente cambia email, il blur riscatta la scoperta.
    setScoperta({ fase: "manuale" });
    emailScopertaRef.current = c.indirizzo;
    emailInizialeRef.current = c.indirizzo;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const email = form.indirizzo.trim();

      // Nuova casella (o email modificata): assicura che la scoperta sia
      // stata eseguita per QUESTA email, anche senza blur (Tab+Invio).
      if (emailScopertaRef.current !== email) {
        emailScopertaRef.current = email;
        const stato = await eseguiScoperta(email);
        if (stato.fase === "gmail") return; // banner OAuth in mostra, niente POST
        if (stato.fase === "checking") return;
      } else if (scoperta.fase === "gmail") {
        return;
      } else if (scoperta.fase === "checking") {
        return;
      }

      const body: Partial<FormData> = { ...form };
      // In modifica una password vuota significa "non cambiarla": si omette
      // dal payload per non sovrascrivere quella salvata.
      if (editingId && !form.password) delete body.password;

      const res = await fetch(editingId ? `/api/caselle/${editingId}` : "/api/caselle", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nel salvataggio.");

      setSuccess(editingId ? "Casella aggiornata." : "Casella creata. Il worker la collegherà entro un ciclo di polling.");
      resetForm();
      await fetchCaselle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setEsitoTest(null);
    setError(null);
    try {
      // Se il form e' aperto sulla stessa casella con una password nuova,
      // la si prova senza salvare.
      const body: { password?: string } = {};
      if (editingId === id && form.password) body.password = form.password;

      const res = await fetch(`/api/caselle/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore durante la verifica.");

      if (data.ok) {
        setEsitoTest(
          data.gmail ? "Collegamento Gmail verificato." : "Connessione IMAP e SMTP riuscita."
        );
      } else if (data.gmail) {
        setEsitoTest(`Verifica Gmail fallita — ${data.gmail.errore ?? "errore"}`);
      } else {
        const parti: string[] = [];
        if (!data.imap?.ok) parti.push(`IMAP: ${data.imap?.errore ?? "errore"}`);
        if (!data.smtp?.ok) parti.push(`SMTP: ${data.smtp?.errore ?? "errore"}`);
        setEsitoTest(`Verifica fallita — ${parti.join(" | ")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la verifica.");
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleAbilitata = async (c: CasellaEmail) => {
    setError(null);
    try {
      const res = await fetch(`/api/caselle/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abilitata: !c.abilitata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nell'aggiornamento.");
      await fetchCaselle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'aggiornamento.");
    }
  };

  const handleSetDefault = async (c: CasellaEmail) => {
    setError(null);
    try {
      const res = await fetch(`/api/caselle/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predefinita: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nell'aggiornamento.");
      setSuccess(`${c.indirizzo} è ora la casella predefinita.`);
      await fetchCaselle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'aggiornamento.");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/caselle/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nell'eliminazione.");
      setSuccess("Casella eliminata.");
      setConfirmDelete(null);
      await fetchCaselle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione.");
    }
  };

  if (caricamentoSessione) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!sessione) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stato-attesa-bordo bg-stato-attesa-bg">
            <LockClosedIcon className="h-6 w-6 text-stato-attesa-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <a
            href="/login?redirect=/admin/email"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stato-attesa-bordo bg-stato-attesa-bg">
            <LockClosedIcon className="h-6 w-6 text-stato-attesa-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            La gestione delle caselle email è accessibile solo con un account amministratore.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Caselle Email"
          sottotitolo="Collega una o più caselle: ogni messaggio ricevuto diventa un ticket, con risposte dallo stesso account."
          azioni={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  // Reindirizza alla schermata ufficiale di consenso Google:
                  // nessun server, porta o password da inserire (OAuth 2.0).
                  window.location.href = "/api/gmail/connect";
                }}
                className="flex cursor-pointer items-center gap-2 rounded-control border border-stato-info-bordo bg-stato-info-bg px-4 py-2 text-sm font-semibold text-stato-info-testo transition-colors duration-200 hover:bg-white"
                title="Collega un account Gmail con OAuth 2.0 (senza password)"
              >
                <MailIcon className="h-4 w-4" />
                Collega il tuo account Gmail
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
              >
                <PlusIcon className="h-4 w-4" />
                Nuova Casella
              </button>
            </div>
          }
        />

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              aria-label="Chiudi il messaggio di errore"
              className="ml-auto cursor-pointer text-stato-urgenza-testo/70 transition-colors duration-200 hover:text-stato-urgenza-testo"
            >
              &times;
            </button>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
        {esitoTest && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-control border p-3 text-sm ${
              esitoTest.startsWith("Connessione")
                ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                : "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
            }`}
          >
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {esitoTest}
            <button
              onClick={() => setEsitoTest(null)}
              aria-label="Chiudi l'esito"
              className="ml-auto cursor-pointer opacity-70 transition-opacity duration-200 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        )}

        {!encryptionOk && (
          <div className="mb-4 rounded-control border border-stato-attesa-bordo bg-stato-attesa-bg p-3 text-sm text-stato-attesa-testo">
            La variabile <code className="rounded border border-stato-attesa-bordo bg-white px-1">ENCRYPTION_KEY</code> non è
            configurata: non è possibile salvare le password delle caselle. Impostala nel file{" "}
            <code className="rounded border border-stato-attesa-bordo bg-white px-1">.env.local</code> e riavvia
            l&apos;applicazione.
          </div>
        )}

        {showForm && (
          <div className="mb-6 overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo={editingId ? "Modifica Casella" : "Nuova Casella"} icona={MailIcon}>
              <button
                onClick={resetForm}
                aria-label="Chiudi il modulo"
                className="cursor-pointer text-xl leading-none text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
              >
                &times;
              </button>
            </SectionBar>
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Etichetta *</label>
                  <input
                    type="text"
                    required
                    value={form.etichetta}
                    onChange={(e) => setForm({ ...form, etichetta: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="Supporto, Commerciale…"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Indirizzo email *</label>
                  <input
                    type="email"
                    required
                    value={form.indirizzo}
                    onChange={(e) => setForm({ ...form, indirizzo: e.target.value })}
                    onBlur={handleBlurIndirizzo}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="supporto@azienda.it"
                  />
                </div>

                {/* --- Esito dell'auto-scoperta IMAP/SMTP ------------------ */}
                {!editingId && scoperta.fase === "idle" && (
                  <p className="sm:col-span-2 text-xs text-caldo-testo">
                    Inserisci l&apos;email: i server IMAP e SMTP vengono rilevati automaticamente,
                    senza doverli scrivere. Ti basteranno email e password.
                  </p>
                )}
                {scoperta.fase === "checking" && (
                  <p className="sm:col-span-2 flex items-center gap-2 text-sm text-caldo-testo">
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                    Rilevamento delle impostazioni di posta in corso…
                  </p>
                )}
                {scoperta.fase === "rilevato" && (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo">
                    <CheckCircleIcon className="h-4 w-4 shrink-0" />
                    <span>
                      Server rilevati automaticamente (fonte: {FONTE_LABEL[scoperta.fonte] ?? scoperta.fonte}).
                    </span>
                    <button
                      type="button"
                      onClick={() => setScoperta({ fase: "manuale" })}
                      className="cursor-pointer underline opacity-80 transition-opacity hover:opacity-100"
                    >
                      Correggi manualmente
                    </button>
                  </div>
                )}
                {scoperta.fase === "gmail" && (
                  <div className="sm:col-span-2 rounded-control border border-stato-info-bordo bg-stato-info-bg p-4 text-sm text-stato-info-testo">
                    <p className="font-semibold">Questo è un account Gmail.</p>
                    <p className="mt-1">
                      Collegalo con Google (OAuth): nessuna password, nessun server da inserire.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <a
                        href="/api/gmail/connect"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
                      >
                        <MailIcon className="h-4 w-4" />
                        Collega con Google
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            imap_host: "imap.gmail.com",
                            imap_port: 993,
                            imap_secure: true,
                            smtp_host: "smtp.gmail.com",
                            smtp_port: 587,
                            smtp_secure: false,
                            utente: f.indirizzo,
                          }));
                          setScoperta({
                            fase: "manuale",
                            avvertimento:
                              "IMAP di Gmail richiede una password app di Google (myaccount.google.com/apppasswords): la password normale viene rifiutata.",
                          });
                        }}
                        className="cursor-pointer text-sm underline opacity-80 transition-opacity hover:opacity-100"
                      >
                        Continua comunque con IMAP
                      </button>
                    </div>
                  </div>
                )}
                {scoperta.fase === "manuale" && scoperta.avvertimento && (
                  <p className="sm:col-span-2 rounded-control border border-stato-attesa-bordo bg-stato-attesa-bg p-3 text-xs text-stato-attesa-testo">
                    {scoperta.avvertimento}
                  </p>
                )}

                {/* --- Campi server: visibili SOLO quando servono ---------- */}
                {scoperta.fase === "manuale" && (
                  <>
                    <div className="sm:col-span-2 border-t border-crema-bordo pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Server in ricezione (IMAP)</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-caldo-testo">Host IMAP *</label>
                      <input
                        type="text"
                        required
                        value={form.imap_host}
                        onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                        className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                        placeholder="imap.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-caldo-testo">Porta *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={65535}
                        value={form.imap_port}
                        onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })}
                        className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                      />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-caldo-testo">
                    <input
                      type="checkbox"
                      checked={form.imap_secure}
                      onChange={(e) => setForm({ ...form, imap_secure: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-inchiostro"
                    />
                    Connessione sicura (TLS/SSL — di norma spuntata, porta 993)
                  </label>
                </div>

                <div className="sm:col-span-2 border-t border-crema-bordo pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Server in invio (SMTP)</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-caldo-testo">Host SMTP *</label>
                      <input
                        type="text"
                        required
                        value={form.smtp_host}
                        onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                        className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-caldo-testo">Porta *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={65535}
                        value={form.smtp_port}
                        onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })}
                        className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                      />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-caldo-testo">
                    <input
                      type="checkbox"
                      checked={form.smtp_secure}
                      onChange={(e) => setForm({ ...form, smtp_secure: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-inchiostro"
                    />
                    Connessione sicura (TLS/SSL — porta 465; per 587 con STARTTLS lascia spuntato)
                  </label>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Utente *</label>
                  <input
                    type="text"
                    required
                    value={form.utente}
                    onChange={(e) => setForm({ ...form, utente: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="supporto@azienda.it"
                  />
                </div>
                  </>
                )}

                {scoperta.fase !== "gmail" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-caldo-testo">
                      Password {editingId ? "(lascia vuoto per non cambiare)" : "*"}
                    </label>
                    <input
                      type="password"
                      required={!editingId}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                      placeholder={editingId ? "••••••••" : "Password dell'account"}
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {scoperta.fase !== "gmail" && (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-crema-bordo pt-4">
                    <label className="flex items-center gap-2 text-sm text-caldo-testo">
                      <input
                        type="checkbox"
                        checked={form.abilitata}
                        onChange={(e) => setForm({ ...form, abilitata: e.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-inchiostro"
                      />
                      Abilitata (il worker la polla)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-caldo-testo">
                      <input
                        type="checkbox"
                        checked={form.predefinita}
                        onChange={(e) => setForm({ ...form, predefinita: e.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-inchiostro"
                      />
                      Predefinita (mittente per ticket manuali e notifiche)
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {scoperta.fase !== "gmail" && (
                  <button
                    type="submit"
                    disabled={saving || !encryptionOk}
                    className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                    {editingId ? "Salva Modifiche" : "Crea Casella"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetForm}
                  className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Annulla
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => handleTest(editingId)}
                    disabled={testingId !== null}
                    className="flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testingId === editingId ? (
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshIcon className="h-4 w-4" />
                    )}
                    Verifica connessione
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Caselle collegate" icona={MailIcon} conteggio={caselle.length} />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : caselle.length === 0 ? (
            <div className="py-12 text-center text-sm text-caldo-testo">
              Nessuna casella collegata. Aggiungine una per iniziare a creare ticket da email.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-crema-bordo bg-crema-scuro">
                    <th className="px-5 py-3 font-medium text-caldo-testo">Etichetta</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Indirizzo</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">IMAP</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">SMTP</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Stato</th>
                    <th className="px-5 py-3 text-right font-medium text-caldo-testo">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {caselle.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-crema-bordo transition-colors duration-200 last:border-0 hover:bg-crema-scuro"
                    >
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-medium text-inchiostro">
                          {c.etichetta}
                          {c.tipo === "gmail" && (
                            <span className="inline-flex items-center rounded-full border border-stato-info-bordo bg-stato-info-bg px-2 py-0.5 text-[11px] font-medium text-stato-info-testo">
                              Gmail OAuth
                            </span>
                          )}
                          {c.predefinita && (
                            <span className="inline-flex items-center rounded-full border border-stato-ok-bordo bg-stato-ok-bg px-2 py-0.5 text-[11px] font-medium text-stato-ok-testo">
                              Predefinita
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-caldo-testo">{c.indirizzo}</td>
                      <td className="px-5 py-3 text-caldo-testo">
                        {c.tipo === "gmail" ? "Gmail API" : `${c.imap_host}:${c.imap_port}`}
                      </td>
                      <td className="px-5 py-3 text-caldo-testo">
                        {c.tipo === "gmail" ? "Gmail API" : `${c.smtp_host}:${c.smtp_port}`}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            c.abilitata
                              ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                              : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"
                          }`}
                        >
                          {c.abilitata ? "Abilitata" : "Disabilitata"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleTest(c.id)}
                            disabled={testingId !== null}
                            className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-ok-bordo hover:bg-stato-ok-bg hover:text-stato-ok-testo disabled:cursor-not-allowed disabled:opacity-50"
                            title="Verifica connessione"
                            aria-label={`Verifica la connessione di ${c.indirizzo}`}
                          >
                            {testingId === c.id ? (
                              <LoaderIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshIcon className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleToggleAbilitata(c)}
                            className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:border-stato-info-bordo hover:bg-stato-info-bg hover:text-stato-info-testo"
                            title={c.abilitata ? "Disabilita" : "Abilita"}
                          >
                            {c.abilitata ? "Disabilita" : "Abilita"}
                          </button>
                          {!c.predefinita && (
                            <button
                              onClick={() => handleSetDefault(c)}
                              className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:border-stato-ok-bordo hover:bg-stato-ok-bg hover:text-stato-ok-testo"
                              title="Imposta come predefinita"
                            >
                              Default
                            </button>
                          )}
                          {c.tipo !== "gmail" && (
                            <button
                              onClick={() => handleEdit(c)}
                              className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-info-bordo hover:bg-stato-info-bg hover:text-stato-info-testo"
                              title="Modifica"
                              aria-label={`Modifica ${c.indirizzo}`}
                            >
                              <EditIcon className="h-4 w-4" />
                            </button>
                          )}
                          {confirmDelete === c.id ? (
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1.5 text-xs font-semibold text-stato-urgenza-testo"
                              title="Conferma eliminazione"
                            >
                              Conferma
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(c.id)}
                              className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-urgenza-bordo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                              title="Elimina"
                              aria-label={`Elimina ${c.indirizzo}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-caldo-testo">
          Le nuove caselle vengono colte dal worker entro un ciclo di polling (ogni 5 minuti in
          produzione). Le password sono cifrate nel database con{" "}
          <code className="rounded border border-crema-contorno bg-white px-1">ENCRYPTION_KEY</code>.
        </p>
      </div>
    </div>
  );
}

// useSearchParams richiede un boundary Suspense in Next 14 (stesso pattern
// di app/login/page.tsx): senza, il prerender fallisce.
export default function CaselleEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6">
          <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
        </div>
      }
    >
      <CaselleEmailPageContent />
    </Suspense>
  );
}
