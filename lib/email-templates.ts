const HEADER = `
<div style="background:#f1f5f9;padding:24px;text-align:center">
  <h1 style="margin:0;font-family:sans-serif;font-size:20px;color:#1e293b">Support Desk</h1>
  <p style="margin:4px 0 0;font-family:sans-serif;font-size:12px;color:#64748b">Gestione Ticket</p>
</div>`;

const FOOTER = `
<div style="background:#f1f5f9;padding:16px;text-align:center;font-family:sans-serif;font-size:11px;color:#94a3b8">
  Questa email e' stata inviata automaticamente dal sistema Support Desk.<br>
  Per assistenza contatta il nostro team di supporto.
</div>`;

function wrap(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;color:#334155">
  ${HEADER}
  <div style="padding:24px;max-width:600px;margin:0 auto">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b">${title}</h2>
    ${body}
  </div>
  ${FOOTER}
</body>
</html>`;
}

export function emailNuovoTicket(opts: {
  numero: string;
  cliente: string;
  sommario: string;
  descrizione: string;
  priorita: string;
}): string {
  return wrap("Ticket Ricevuto", `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px">
      Il tuo ticket <strong>${opts.numero}</strong> e' stato ricevuto e sara' elaborato al piu' presto.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px">Numero</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;font-weight:600">${opts.numero}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Problema</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.sommario}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Priorita'</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.priorita}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#64748b">
      Ti notifyeremo quando ci sara' un aggiornamento sul tuo ticket.
    </p>
  `);
}

export function emailAssegnazione(opts: {
  numero: string;
  cliente: string;
  operatore: string;
}): string {
  return wrap("Ticket Preso in Carico", `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px">
      Il tuo ticket <strong>${opts.numero}</strong> e' stato preso in carico dal nostro operatore
      <strong>${opts.operatore}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:14px">
      Riceverai ulteriori aggiornamenti man mano che il problema verra' risolto.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b">
      Grazie per la pazienza.
    </p>
  `);
}

export function emailNuovaNota(opts: {
  numero: string;
  cliente: string;
  titoloNota: string;
  soluzione?: string;
  operatore: string;
  allegati?: string[];
}): string {
  let attachmentsHtml = "";
  if (opts.allegati && opts.allegati.length > 0) {
    const rows = opts.allegati
      .map((a) => `<li style="margin:4px 0;font-size:13px;color:#475569">${a}</li>`)
      .join("");
    attachmentsHtml = `
      <div style="margin-top:16px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e293b">File allegati (${opts.allegati.length}):</p>
        <ul style="margin:0;padding-left:20px">${rows}</ul>
      </div>`;
  }

  return wrap("Aggiornamento Ticket", `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px">
      E' stato registrato un nuovo aggiornamento sul ticket <strong>${opts.numero}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px">Aggiornamento</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.titoloNota}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Operatore</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.operatore}</td>
      </tr>
    </table>
    ${opts.soluzione ? `
    <div style="margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e293b">Dettaglio intervento:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap">${opts.soluzione}</div>
    </div>` : ""}
    ${attachmentsHtml}
    <p style="margin:16px 0 0;font-size:13px;color:#64748b">
      Per maggiori dettagli accedi alla piattaforma di supporto.
    </p>
  `);
}

export function emailChiusura(opts: {
  numero: string;
  cliente: string;
  sommario: string;
  dataChiusura: string;
  noteTecniche?: { titolo: string; soluzione: string; operatore: string }[];
  allegati?: string[];
}): string {
  let notesHtml = "";
  if (opts.noteTecniche && opts.noteTecniche.length > 0) {
    const rows = opts.noteTecniche
      .map(
        (n) => `
      <div style="margin-bottom:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1e293b">${n.titolo}</p>
        <p style="margin:0 0 6px;font-size:11px;color:#94a3b8">Operatore: ${n.operatore}</p>
        <div style="font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap">${n.soluzione}</div>
      </div>`
      )
      .join("");
    notesHtml = `
      <div style="margin-top:16px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b">Riepilogo interventi:</p>
        ${rows}
      </div>`;
  }

  let attachmentsHtml = "";
  if (opts.allegati && opts.allegati.length > 0) {
    const items = opts.allegati
      .map((a) => `<li style="margin:4px 0;font-size:13px;color:#475569">${a}</li>`)
      .join("");
    attachmentsHtml = `
      <div style="margin-top:16px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b">File allegati (${opts.allegati.length}):</p>
        <ul style="margin:0;padding-left:20px">${items}</ul>
      </div>`;
  }

  return wrap("Ticket Chiuso", `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px">
      Il tuo ticket <strong>${opts.numero}</strong> e' stato risolto e chiuso.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px">Numero</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;font-weight:600">${opts.numero}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Problema</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.sommario}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Chiuso il</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.dataChiusura}</td>
      </tr>
    </table>
    ${notesHtml}
    ${attachmentsHtml}
    <p style="margin:16px 0 0;font-size:14px">
      Se il problema non e' stato risolto in modo soddisfacente, puoi riaprire un ticket contattando il supporto.
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#64748b">
      Grazie per averci contattato.
    </p>
  `);
}

export function emailManuale(opts: {
  numero: string;
  cliente: string;
  oggetto: string;
  messaggio: string;
}): string {
  return wrap(opts.oggetto, `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <div style="margin:0 0 16px;font-size:14px;line-height:1.6;white-space:pre-wrap">${opts.messaggio}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px">Ticket</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;font-weight:600">${opts.numero}</td>
      </tr>
    </table>
  `);
}

export function emailAutoReply(opts: {
  numero: string;
  cliente: string;
  oggettoOriginale: string;
}): string {
  return wrap("Ricevuto la tua richiesta", `
    <p style="margin:0 0 12px;font-size:14px">Gentile <strong>${opts.cliente}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px">
      Abbiamo ricevuto la tua email e le abbiamo assegnato il ticket <strong>${opts.numero}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px">Ticket</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;font-weight:600">${opts.numero}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Oggetto</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px">${opts.oggettoOriginale}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:14px">
      Un operatore prendera' in carco la tua richiesta al piu' presto.
      Riceverai ulteriori aggiornamenti man mano che il problema verra' esaminato.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b">
      Per urgenze, contattaci telefonicamente.
    </p>
  `);
}
