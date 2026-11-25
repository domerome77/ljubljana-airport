import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { InvoiceDoc } from './emails.ts';
import { eur, longDate, pct } from './format.ts';

const MAP: Record<string, string> = { 'Č': 'C', 'č': 'c', 'Ć': 'C', 'ć': 'c', 'Đ': 'D', 'đ': 'd', '→': '->', '—': '-', '–': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '×': 'x', '·': '-' };

/** Standard PDF fonts use WinAnsi: keep € š ž, transliterate the rest. */
export function pdfSafe(s: string): string {
  return [...String(s ?? '')].map((ch) => MAP[ch] ?? ch).join('').replace(/[^\x20-\x7E -ÿ€šžŠŽ]/g, '?');
}

export async function buildInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  const title = inv.kind === 'credit_note' ? 'Credit note' : 'Invoice';
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${inv.number}`);
  doc.setAuthor(inv.company.name);
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.13, 0.18);
  const muted = rgb(0.36, 0.4, 0.46);
  let y = 800;
  const text = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: typeof ink; right?: boolean } = {}) => {
    const f = o.b ? bold : font;
    const size = o.size ?? 10;
    const t = pdfSafe(s);
    const xx = o.right ? x - f.widthOfTextAtSize(t, size) : x;
    page.drawText(t, { x: xx, y: yy, size, font: f, color: o.color ?? ink });
  };
  const c = inv.company;
  text(c.name, 50, y, { size: 14, b: true });
  [c.address, `VAT ID: ${c.vatId}   Reg. no.: ${c.regNo}`, `IBAN: ${c.iban}`, `${c.email}   ${c.phone}`].forEach((l, i) => text(l, 50, y - 18 - i * 13, { color: muted }));
  text(title, 545, y, { size: 20, b: true, right: true });
  text(`No. ${inv.number}`, 545, y - 22, { b: true, right: true });
  text(`Issued: ${longDate(inv.issuedAt)}`, 545, y - 36, { right: true });
  text(`Service date: ${longDate(inv.serviceDate + 'T12:00:00Z')}`, 545, y - 50, { right: true });
  if (inv.refersTo) text(`Refers to invoice ${inv.refersTo}`, 545, y - 64, { right: true });
  y -= 110;
  text('Bill to', 50, y, { color: muted });
  const b = inv.buyer;
  const billTo = b.company ? [b.company.name, b.company.address, `VAT ID: ${b.company.vatId}`, `Attn: ${b.name}`] : [b.name];
  if (b.email) billTo.push(b.email);
  billTo.forEach((l, i) => text(l, 50, y - 15 - i * 13, { b: i === 0 }));
  y -= 40 + billTo.length * 13;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: muted });
  text('Description', 50, y - 14, { color: muted });
  text('Qty', 440, y - 14, { color: muted, right: true });
  text('Amount', 545, y - 14, { color: muted, right: true });
  y -= 34;
  for (const l of inv.lines) {
    text(l.description.slice(0, 80), 50, y);
    text(String(l.qty), 440, y, { right: true });
    text(eur(l.gross), 545, y, { right: true });
    y -= 18;
  }
  page.drawLine({ start: { x: 300, y }, end: { x: 545, y }, thickness: 0.5, color: muted });
  y -= 18;
  text('Net', 440, y, { right: true }); text(eur(inv.net), 545, y, { right: true });
  y -= 15;
  text(`VAT ${pct(inv.vatRate)}`, 440, y, { right: true }); text(eur(inv.vat), 545, y, { right: true });
  y -= 20;
  text('Total', 440, y, { right: true, b: true, size: 13 }); text(eur(inv.gross), 545, y, { right: true, b: true, size: 13 });
  y -= 40;
  const pm = inv.paymentMethod === 'revolut' ? 'Paid by card via Revolut.' : inv.paymentMethod === 'desk_cash' ? 'Paid in cash.' : inv.paymentMethod === 'desk_card' ? 'Paid by card at the desk.' : '';
  text(inv.kind === 'credit_note' ? 'Amount refunded to the original payment method.' : pm, 50, y, { color: muted });
  text('Prices include VAT. Passenger transport Ljubljana Airport (LJU).', 50, y - 14, { color: muted });
  return doc.save();
}
