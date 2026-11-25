import { PDFDocument } from 'pdf-lib';
import { renderConfirmationEmail, renderInvoiceEmail, type BookingView, type InvoiceDoc } from '../../functions/_shared/emails';
import { buildInvoicePdf, pdfSafe } from '../../functions/_shared/invoicePdf';

const view: BookingView = {
  ref: 'LJU-7K3F9Q', status: 'paid', routeCode: 'LJU-BLED', routeName: 'Ljubljana Airport → Bled', destinationLabel: 'Bled — any address',
  departsAt: '2026-11-25T13:30:00.000Z', product: 'shared', passengers: 2, amount: 40, lines: [{ label: '2 × 20.00 €', amount: 40 }],
  plate: 'LJ-AB-123', meetingPoint: { imageUrl: 'assets/meeting-point-mock.svg', text: 'Turn right after arrivals.' },
  supportPhone: '+386 00 000 000', buyerName: 'Ana Novak', holdExpiresAt: null,
};
const company = { name: 'Markun Borut d.o.o.', address: 'Cesta 1, 4210 Brnik', vatId: 'SI12345678', regNo: '1234567000', iban: 'SI56 1234', email: 'info@x.si', phone: '+386 1' };
const inv: InvoiceDoc = {
  kind: 'invoice', number: '2026-000001', issuedAt: '2026-11-25T12:00:00Z', serviceDate: '2026-11-25', company,
  buyer: { name: 'Ana Novak', email: 'ana@example.com', company: { name: 'ACME d.o.o.', address: 'Main 1', vatId: 'SI999' } },
  lines: [{ description: 'Airport transfer Ljubljana Airport → Bled, 14:30 25 Nov 2026, shared, 2 people', qty: 1, unitGross: 40, gross: 40 }],
  vatRate: 0.095, net: 36.53, vat: 3.47, gross: 40, paymentMethod: 'revolut', refersTo: null,
};

test('confirmation email has plate, ref, local time and link, but no internal vehicle name', () => {
  const e = renderConfirmationEmail(view, { baseUrl: 'https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/', ticketUrl: 'https://t/#/booking/1?t=2', vehicleName: 'Kombi Secret' });
  expect(e.subject).toBe('Your GoOpti transfer · Ljubljana Airport → Bled · 14:30 Wed 25 Nov · LJU-7K3F9Q');
  for (const s of ['LJ-AB-123', 'LJU-7K3F9Q', '14:30', 'https://t/#/booking/1?t=2', 'https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/assets/meeting-point-mock.svg', 'Bled']) {
    expect(e.html).toContain(s);
  }
  expect(e.text).toContain('LJ-AB-123');
  expect(e.html + e.text).not.toContain('Kombi Secret');
});

test('invoice email shows issuer, buyer company and VAT split', () => {
  const e = renderInvoiceEmail(inv);
  expect(e.subject).toBe('Invoice 2026-000001 · Markun Borut d.o.o.');
  for (const s of ['Markun Borut d.o.o.', 'SI12345678', 'ACME d.o.o.', 'SI999', '36.53', '3.47', '40.00', '9.5 %']) expect(e.html).toContain(s);
});

test('credit note email is titled and negative', () => {
  const e = renderInvoiceEmail({ ...inv, kind: 'credit_note', number: 'D-2026-000001', refersTo: '2026-000001', net: -36.53, vat: -3.47, gross: -40,
    lines: [{ ...inv.lines[0], unitGross: -40, gross: -40 }] });
  expect(e.subject).toBe('Credit note D-2026-000001 · Markun Borut d.o.o.');
  expect(e.html).toContain('-40.00');
  expect(e.html).toContain('2026-000001');
});

test('invoice PDF is a valid one-page PDF', async () => {
  const bytes = await buildInvoicePdf(inv);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getTitle()).toBe('Invoice 2026-000001');
});

test('pdfSafe replaces characters the standard PDF font cannot encode', () => {
  expect(pdfSafe('Čatež → Bled — ćđ “x”')).toBe('Catež -> Bled - cd "x"');
});
