// Serializzazione di una cella CSV. Modulo puro (niente DB, niente
// "server-only") cosi' e' testabile direttamente.

export type ValoreCsv = string | number | boolean | null | undefined;

export function cellaCsv(v: ValoreCsv): string {
  let s = String(v ?? "");
  // CSV injection: Excel/LibreOffice interpretano come formula una cella che
  // inizia con = + - @ (o tab/CR). Un cliente chiamato "=HYPERLINK(...)"
  // eseguirebbe la formula all'apertura del report. L'apostrofo la rende
  // testo. Solo per le stringhe: i numeri restano numeri.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
