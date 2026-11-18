// Tipi di allegato ammessi e regole di visualizzazione.
//
// Il MIME NON si prende mai dal client: un file .html dichiarato "image/png"
// verrebbe servito come immagine, ma alcuni browser lo annusano comunque come
// HTML ed eseguono lo script. Qui il tipo si deriva dall'estensione su una
// lista chiusa; tutto cio' che non e' in lista viene rifiutato all'upload e
// servito come application/octet-stream (mai eseguito) alla lettura.

export const MIME_ALLEGATI: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
};

// Solo questi possono essere mostrati dentro il browser. SVG e' escluso di
// proposito: e' un documento XML che puo' contenere script.
const MIME_INLINE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function estensione(nome: string): string {
  const pulito = nome.split(/[\\/]/).pop() ?? "";
  const punto = pulito.lastIndexOf(".");
  if (punto <= 0 || punto === pulito.length - 1) return "";
  return pulito.slice(punto + 1).toLowerCase();
}

export function mimeDaNome(nome: string): string | null {
  const ext = estensione(nome);
  return MIME_ALLEGATI[ext] ?? null;
}

export function mimeDaFile(nomeOriginale: string): string {
  return mimeDaNome(nomeOriginale) ?? "application/octet-stream";
}

export function inlineConsentito(mime: string): boolean {
  return MIME_INLINE.has(mime);
}

// Nome da mostrare/salvare su disco: via il percorso, i caratteri di controllo
// e le virgolette che romperebbero l'header Content-Disposition.
export function nomeOriginaleSicuro(nome: string): string {
  const base = (nome.split(/[\\/]/).pop() ?? "allegato")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim();
  return base.slice(0, 180) || "allegato";
}
