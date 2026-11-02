// Il parametro ?redirect= arriva dall'esterno (URL del middleware o link
// forgiato): accettiamo SOLO path interni. Senza questo controllo,
// ?redirect=https://evil.example porta via l'utente appena fa login.
// Regole:
//  - deve iniziare con "/" (niente URL assoluti)
//  - niente "//" (protocol-relative) e niente "\" (i browser normalizzano
//    backslash in slash, quindi /\evil.com diventa //evil.com)
//  - niente caratteri di controllo (CR/LF)
export function redirectSicuro(param: string | null | undefined): string {
  if (!param) return "/";
  if (!param.startsWith("/")) return "/";
  if (param.startsWith("//")) return "/";
  if (param.includes("\\")) return "/";
  for (let i = 0; i < param.length; i++) {
    const c = param.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return "/";
  }
  return param;
}
