// Request handlers with injected dependencies — unit-tested in node, wired to Supabase/Revolut/Resend in each function's index.ts.
import { renderConfirmationEmail, renderInvoiceEmail, type BookingView, type InvoiceDoc } from './emails.ts';
import type { RevolutOrderInput } from './revolut.ts';
import { verifyRevolutSignature } from './revolut.ts';
import { toBase64, type EmailMessage } from './resend.ts';

export interface HeldBooking {
  id: string; token: string; ref: string; amount: number; email?: string; status: string; holdExpiresAt: string | null; routeName: string;
  revolutOrderId?: string | null; checkoutUrl?: string | null;
}
export interface Documents { booking: { id: string; token: string; buyer: { name: string; email?: string } }; view: BookingView; invoice: InvoiceDoc | null; creditNote: InvoiceDoc | null }
export interface EmailLog { bookingId: string; kind: 'confirmation' | 'invoice' | 'credit_note' | 'update'; to: string; status: 'sent' | 'failed'; providerId?: string; error?: string }

export interface Deps {
  db: {
    getHeldBooking(id: string, token: string): Promise<HeldBooking | null>;
    setRevolutOrder(id: string, orderId: string, checkoutUrl: string): Promise<void>;
    findByRevolutOrder(orderId: string): Promise<string | null>;
    findByRef(ref: string): Promise<string | null>;
    hasSentConfirmation(bookingId: string): Promise<boolean>;
    markPaid(id: string, method: 'revolut', orderId: string): Promise<{ alreadyPaid: boolean }>;
    documents(id: string): Promise<Documents>;
    bookingIdsOfDeparture(departureId: string): Promise<string[]>;
    logEmail(e: EmailLog): Promise<void>;
  };
  revolut(o: RevolutOrderInput): Promise<{ id: string; checkoutUrl: string }>;
  send(m: EmailMessage): Promise<{ id: string }>;
  pdf(inv: InvoiceDoc): Promise<Uint8Array>;
  inviteUser(email: string, role: 'admin' | 'desk', displayName: string): Promise<void>;
  env: { publicBaseUrl: string; mailFrom: string; webhookSecret: string; now: () => number; holdMinutes: number };
}

export interface Result { status: number; body?: unknown }
const err = (status: number, code: string, message: string): Result => ({ status, body: { code, message } });

export const ticketUrl = (base: string, id: string, token: string) => `${base.replace(/\/?$/, '/')}#/booking/${id}?t=${token}`;

export async function handleCreateCheckout(deps: Deps, body: { bookingId?: string; token?: string }): Promise<Result> {
  if (!body?.bookingId || !body?.token) return err(400, 'INVALID', 'Missing booking');
  const b = await deps.db.getHeldBooking(body.bookingId, body.token);
  if (!b) return err(404, 'NOT_FOUND', 'Booking not found');
  if (b.status !== 'held' || !b.holdExpiresAt || Date.parse(b.holdExpiresAt) <= deps.env.now()) {
    return err(409, 'SALES_CLOSED', 'Your reservation expired — please choose your departure again');
  }
  // Reuse the pending order: a second order would leave the first payment unmatched.
  if (b.revolutOrderId && b.checkoutUrl) return { status: 200, body: { checkoutUrl: b.checkoutUrl } };
  const remainingMin = Math.max(1, Math.floor((Date.parse(b.holdExpiresAt) - deps.env.now()) / 60_000));
  const order = await deps.revolut({
    amountMinor: Math.round(Number(b.amount) * 100), currency: 'EUR', description: `GoOpti transfer ${b.routeName} · ${b.ref}`,
    email: b.email, reference: b.ref, redirectUrl: ticketUrl(deps.env.publicBaseUrl, b.id, b.token), expireAfter: `PT${remainingMin}M`,
  });
  await deps.db.setRevolutOrder(b.id, order.id, order.checkoutUrl);
  return { status: 200, body: { checkoutUrl: order.checkoutUrl } };
}

async function deliver(deps: Deps, bookingId: string, kind: EmailLog['kind'], to: string, m: Omit<EmailMessage, 'from' | 'to'>) {
  try {
    const r = await deps.send({ ...m, from: deps.env.mailFrom, to });
    await deps.db.logEmail({ bookingId, kind, to, status: 'sent', providerId: r.id });
  } catch (e) {
    await deps.db.logEmail({ bookingId, kind, to, status: 'failed', error: e instanceof Error ? e.message : String(e) });
  }
}

async function deliverInvoice(deps: Deps, bookingId: string, to: string, inv: InvoiceDoc) {
  const kind = inv.kind === 'credit_note' ? 'credit_note' : 'invoice';
  try {
    const r = renderInvoiceEmail(inv);
    const pdf = await deps.pdf(inv);
    await deliver(deps, bookingId, kind, to, { ...r, attachments: [{ filename: `${kind === 'credit_note' ? 'credit-note' : 'invoice'}-${inv.number}.pdf`, content: toBase64(pdf) }] });
  } catch (e) {
    await deps.db.logEmail({ bookingId, kind, to, status: 'failed', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function sendBookingEmails(deps: Deps, bookingId: string, o: { updated?: boolean; ticketOnly?: boolean } = {}): Promise<void> {
  const docs = await deps.db.documents(bookingId);
  const to = docs.booking.buyer.email;
  if (!to) return;
  const conf = renderConfirmationEmail(docs.view, { baseUrl: deps.env.publicBaseUrl, ticketUrl: ticketUrl(deps.env.publicBaseUrl, docs.booking.id, docs.booking.token), updated: o.updated });
  await deliver(deps, bookingId, o.updated ? 'update' : 'confirmation', to, conf);
  if (!o.ticketOnly && docs.invoice) await deliverInvoice(deps, bookingId, to, docs.invoice);
}

export async function sendCreditNote(deps: Deps, bookingId: string): Promise<void> {
  const docs = await deps.db.documents(bookingId);
  if (docs.booking.buyer.email && docs.creditNote) {
    await deliverInvoice(deps, bookingId, docs.booking.buyer.email, docs.creditNote);
  }
}

export async function handleWebhook(deps: Deps, rawBody: string, headers: Record<string, string | null | undefined>): Promise<Result> {
  const ok = await verifyRevolutSignature(rawBody, headers['revolut-request-timestamp'] ?? '', headers['revolut-signature'] ?? '', deps.env.webhookSecret, deps.env.now());
  if (!ok) return err(401, 'FORBIDDEN', 'Invalid signature');
  let evt: { event?: string; order_id?: string; merchant_order_ext_ref?: string };
  try { evt = JSON.parse(rawBody); } catch { return err(400, 'INVALID', 'Invalid JSON'); }
  if (evt.event !== 'ORDER_COMPLETED' || !evt.order_id) return { status: 204 };
  const bookingId = (await deps.db.findByRevolutOrder(evt.order_id))
    ?? (evt.merchant_order_ext_ref ? await deps.db.findByRef(evt.merchant_order_ext_ref) : null);
  if (!bookingId) return { status: 204 }; // not ours (other integrations on the same merchant account)
  const r = await deps.db.markPaid(bookingId, 'revolut', evt.order_id);
  if (!r.alreadyPaid || !(await deps.db.hasSentConfirmation(bookingId))) await sendBookingEmails(deps, bookingId);
  return { status: 204 };
}

export type StaffActionBody =
  | { action: 'send-booking-emails' | 'send-credit-note' | 'send-update'; bookingId: string }
  | { action: 'notify-vehicle-change'; departureId: string }
  | { action: 'invite'; email: string; role: 'admin' | 'desk'; displayName: string };

export async function handleStaffAction(deps: Deps, role: 'admin' | 'desk' | null, body: StaffActionBody): Promise<Result> {
  if (!role) return err(403, 'FORBIDDEN', 'Not allowed');
  const adminOnly = ['invite', 'send-credit-note', 'send-update', 'notify-vehicle-change'];
  if (adminOnly.includes(body.action) && role !== 'admin') return err(403, 'FORBIDDEN', 'Not allowed');
  switch (body.action) {
    case 'send-booking-emails': await sendBookingEmails(deps, body.bookingId); break;
    case 'send-update': await sendBookingEmails(deps, body.bookingId, { updated: true, ticketOnly: true }); break;
    case 'send-credit-note': await sendCreditNote(deps, body.bookingId); break;
    case 'notify-vehicle-change':
      for (const id of await deps.db.bookingIdsOfDeparture(body.departureId)) await sendBookingEmails(deps, id, { updated: true, ticketOnly: true });
      break;
    case 'invite':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !['admin', 'desk'].includes(body.role)) return err(400, 'INVALID', 'Email or role is invalid');
      await deps.inviteUser(body.email, body.role, body.displayName);
      break;
    default: return err(400, 'INVALID', 'Unknown action');
  }
  return { status: 200, body: { ok: true } };
}
