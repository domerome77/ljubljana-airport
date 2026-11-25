import { esc, eur, localDate, localTime, longDate, pct } from './format.ts';

export interface BookingView {
  ref: string; status: string; routeCode: 'LJU-LJ' | 'LJU-BLED'; routeName: string; destinationLabel: string; departsAt: string;
  product: 'shared' | 'private'; passengers: number; amount: number; lines: { label: string; amount: number }[]; plate: string | null;
  meetingPoint: { imageUrl: string; text: string }; supportPhone: string; buyerName: string; holdExpiresAt: string | null;
}
export interface Company { name: string; address: string; vatId: string; regNo: string; iban: string; email: string; phone: string }
export interface InvoiceDoc {
  kind: 'invoice' | 'credit_note'; number: string; issuedAt: string; serviceDate: string; company: Company;
  buyer: { name: string; email?: string; phone?: string; company?: { name: string; address: string; vatId: string } };
  lines: { description: string; qty: number; unitGross: number; gross: number }[];
  vatRate: number; net: number; vat: number; gross: number; paymentMethod: string | null; refersTo: string | null;
}
export interface Rendered { subject: string; html: string; text: string }

const PINK = '#ef3181';
const wrap = (inner: string) => `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#16202e">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">${inner}
<p style="font-size:12px;color:#8a94a3;margin-top:24px">GoOpti airport transfers · operated by Markun Borut d.o.o.</p></div></body></html>`;
const abs = (base: string, u: string) => (/^https?:/.test(u) ? u : base.replace(/\/?$/, '/') + u.replace(/^\//, ''));
const city = (v: BookingView) => (v.routeCode === 'LJU-BLED' ? 'Bled' : 'Ljubljana');

export function renderConfirmationEmail(v: BookingView, o: { baseUrl: string; ticketUrl: string; vehicleName?: string; updated?: boolean }): Rendered {
  const when = `${localTime(v.departsAt)} ${localDate(v.departsAt)}`;
  const subject = `${o.updated ? 'Updated: ' : ''}Your GoOpti transfer · ${v.routeName} · ${when} · ${v.ref}`;
  const ride = `${v.product === 'private' ? 'Private van' : 'Shared'} · ${v.passengers} ${v.passengers === 1 ? 'person' : 'people'}`;
  const html = wrap(`
<div style="background:#fff;border-radius:14px;padding:24px;border:1px solid #e6e9ee">
  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c2185e">${o.updated ? 'Updated ticket' : 'Your ticket'}</div>
  <h1 style="margin:6px 0 4px;font-size:24px">${esc(v.routeName)}</h1>
  <div style="font-size:18px">${esc(localDate(v.departsAt))} · <b style="font-size:24px">${esc(localTime(v.departsAt))}</b> <span style="font-size:13px;color:#5b6675">local time</span></div>
  <div style="margin:18px 0;background:#1f1f1f;color:#fff;border-radius:12px;padding:14px 18px">
    <div style="font-size:12px;color:#c9d2de;text-transform:uppercase;letter-spacing:.08em">Your van — licence plate</div>
    <div style="font-family:Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.06em;background:#fff;color:#111;display:inline-block;padding:2px 14px;border-radius:6px;margin-top:6px">${esc(v.plate)}</div>
  </div>
  <table style="width:100%;font-size:15px;border-collapse:collapse">
    <tr><td style="color:#5b6675;padding:4px 0">Booking</td><td style="font-family:Menlo,monospace;font-weight:700">${esc(v.ref)}</td></tr>
    <tr><td style="color:#5b6675;padding:4px 0">Passenger</td><td>${esc(v.buyerName)}</td></tr>
    <tr><td style="color:#5b6675;padding:4px 0">Ride</td><td>${esc(ride)}</td></tr>
    <tr><td style="color:#5b6675;padding:4px 0">Paid</td><td>${esc(eur(v.amount))}</td></tr>
  </table>
  <p style="background:#fff1f7;color:#c2185e;font-weight:700;border-radius:10px;padding:12px 14px">Tell your driver your address in ${city(v)} when you board.</p>
  <p style="margin:0 0 8px"><b>Where to find the van:</b> ${esc(v.meetingPoint.text)}</p>
  <img src="${esc(abs(o.baseUrl, v.meetingPoint.imageUrl))}" alt="Map of the GoOpti van bay at Ljubljana Airport" style="width:100%;border-radius:10px;border:1px solid #e6e9ee">
  <p style="text-align:center;margin:20px 0 4px"><a href="${esc(o.ticketUrl)}" style="background:${PINK};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block">Open your ticket (with QR code)</a></p>
  <p style="font-size:13px;color:#5b6675">Please be at the van 5 minutes before departure. Questions? ${esc(v.supportPhone)}. Your invoice follows in a separate email.</p>
</div>`);
  const text = [
    `${o.updated ? 'UPDATED ' : ''}GoOpti ticket ${v.ref}`, `${v.routeName}`, `${localDate(v.departsAt)} ${localTime(v.departsAt)} (local time)`,
    `Van licence plate: ${v.plate}`, `${ride} · paid ${eur(v.amount)}`, `Tell your driver your address in ${city(v)}.`,
    `Where to find the van: ${v.meetingPoint.text}`, `Ticket: ${o.ticketUrl}`, `Questions: ${v.supportPhone}`,
  ].join('\n');
  return { subject, html, text };
}

export function renderInvoiceEmail(inv: InvoiceDoc): Rendered {
  const title = inv.kind === 'credit_note' ? 'Credit note' : 'Invoice';
  const subject = `${title} ${inv.number} · ${inv.company.name}`;
  const c = inv.company;
  const b = inv.buyer;
  const rows = inv.lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f3">${esc(l.description)}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right;white-space:nowrap">${esc(eur(l.gross))}</td></tr>`).join('');
  const html = wrap(`
<div style="background:#fff;border-radius:14px;padding:24px;border:1px solid #e6e9ee;font-size:14px">
  <table style="width:100%"><tr>
    <td style="vertical-align:top"><b style="font-size:16px">${esc(c.name)}</b><br>${esc(c.address)}<br>VAT ID: ${esc(c.vatId)}<br>Reg. no.: ${esc(c.regNo)}<br>IBAN: ${esc(c.iban)}<br>${esc(c.email)} · ${esc(c.phone)}</td>
    <td style="vertical-align:top;text-align:right"><b style="font-size:20px">${title}</b><br>No. <b>${esc(inv.number)}</b><br>Issued: ${esc(longDate(inv.issuedAt))}<br>Service date: ${esc(longDate(inv.serviceDate + 'T12:00:00Z'))}
    ${inv.refersTo ? `<br>Refers to invoice ${esc(inv.refersTo)}` : ''}</td>
  </tr></table>
  <p style="margin:18px 0 6px;color:#5b6675">Bill to</p>
  <p style="margin:0">${b.company ? `<b>${esc(b.company.name)}</b><br>${esc(b.company.address)}<br>VAT ID: ${esc(b.company.vatId)}<br>Attn: ${esc(b.name)}` : `<b>${esc(b.name)}</b>`}${b.email ? `<br>${esc(b.email)}` : ''}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:18px">
    <tr style="color:#5b6675;font-size:12px;text-transform:uppercase"><td>Description</td><td style="text-align:right">Qty</td><td style="text-align:right">Amount</td></tr>
    ${rows}
    <tr><td colspan="2" style="text-align:right;padding-top:10px">Net</td><td style="text-align:right;padding-top:10px">${esc(eur(inv.net))}</td></tr>
    <tr><td colspan="2" style="text-align:right">VAT ${esc(pct(inv.vatRate))}</td><td style="text-align:right">${esc(eur(inv.vat))}</td></tr>
    <tr><td colspan="2" style="text-align:right;font-weight:700;font-size:16px">Total</td><td style="text-align:right;font-weight:700;font-size:16px">${esc(eur(inv.gross))}</td></tr>
  </table>
  <p style="color:#5b6675">${inv.kind === 'credit_note' ? 'The amount will be refunded to your original payment method.' : `Paid${inv.paymentMethod === 'revolut' ? ' by card via Revolut' : inv.paymentMethod === 'desk_cash' ? ' in cash' : inv.paymentMethod === 'desk_card' ? ' by card at the desk' : ''}. Thank you.`} The PDF is attached.</p>
</div>`);
  const text = [`${title} ${inv.number}`, `${c.name}, ${c.address}, VAT ID ${c.vatId}`, `Bill to: ${b.company ? `${b.company.name}, ${b.company.address}, VAT ID ${b.company.vatId}` : b.name}`,
    ...inv.lines.map((l) => `${l.description}: ${eur(l.gross)}`), `Net ${eur(inv.net)} · VAT ${pct(inv.vatRate)} ${eur(inv.vat)} · Total ${eur(inv.gross)}`].join('\n');
  return { subject, html, text };
}
