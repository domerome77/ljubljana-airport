import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { handleCreateCheckout, handleStaffAction, handleWebhook, type Deps } from '../../functions/_shared/handlers';

const view = { ref: 'LJU-AAA111', status: 'paid', routeCode: 'LJU-LJ', routeName: 'Ljubljana Airport → Ljubljana', destinationLabel: 'x', departsAt: '2026-11-25T13:30:00Z',
  product: 'shared', passengers: 1, amount: 12, lines: [], plate: 'LJ-AB-123', meetingPoint: { imageUrl: 'a.svg', text: 't' }, supportPhone: '1', buyerName: 'Ana', holdExpiresAt: null };
const company = { name: 'Markun Borut d.o.o.', address: 'a', vatId: 'v', regNo: 'r', iban: 'i', email: 'e', phone: 'p' };
const invoice = { kind: 'invoice', number: '2026-000001', issuedAt: '2026-11-25T12:00:00Z', serviceDate: '2026-11-25', company, buyer: { name: 'Ana', email: 'ana@example.com' },
  lines: [{ description: 'd', qty: 1, unitGross: 12, gross: 12 }], vatRate: 0.095, net: 10.96, vat: 1.04, gross: 12, paymentMethod: 'revolut', refersTo: null };

function deps(over: Partial<Deps['db']> = {}): Deps & { sent: { to: string; subject: string; attachments?: unknown[] }[] } {
  const sent: { to: string; subject: string; attachments?: unknown[] }[] = [];
  return {
    sent,
    db: {
      getHeldBooking: vi.fn(async () => ({ id: 'b1', token: 'tok', ref: 'LJU-AAA111', amount: 12, email: 'ana@example.com', status: 'held', holdExpiresAt: '2026-11-25T12:10:00Z', routeName: 'LJU → LJ' })),
      setRevolutOrder: vi.fn(async () => {}),
      findByRevolutOrder: vi.fn(async () => 'b1'),
      findByRef: vi.fn(async () => null),
      hasSentConfirmation: vi.fn(async () => true),
      markPaid: vi.fn(async () => ({ alreadyPaid: false })),
      documents: vi.fn(async () => ({ booking: { id: 'b1', token: 'tok', buyer: { name: 'Ana', email: 'ana@example.com' } }, view, invoice, creditNote: null })),
      bookingIdsOfDeparture: vi.fn(async () => ['b1']),
      logEmail: vi.fn(async () => {}),
      ...over,
    },
    revolut: vi.fn(async () => ({ id: 'ord_1', checkoutUrl: 'https://checkout.revolut.com/payment-link/x' })),
    send: vi.fn(async (m) => { sent.push(m); return { id: 'em_1' }; }),
    pdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    inviteUser: vi.fn(async () => {}),
    env: { publicBaseUrl: 'https://site.test/app/', mailFrom: 'GoOpti <tickets@x.test>', webhookSecret: 'wsk_1', now: () => Date.parse('2026-11-25T12:00:00Z'), holdMinutes: 15 },
  };
}

test('create-checkout charges the DB amount and stores the Revolut order id', async () => {
  const d = deps();
  const r = await handleCreateCheckout(d, { bookingId: 'b1', token: 'tok' });
  expect(r).toEqual({ status: 200, body: { checkoutUrl: 'https://checkout.revolut.com/payment-link/x' } });
  expect(d.revolut).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1200, currency: 'EUR', reference: 'LJU-AAA111', email: 'ana@example.com',
    redirectUrl: 'https://site.test/app/#/booking/b1?t=tok' }));
  expect(d.db.setRevolutOrder).toHaveBeenCalledWith('b1', 'ord_1', 'https://checkout.revolut.com/payment-link/x');
});

test('create-checkout refuses unknown or expired holds', async () => {
  const d = deps({ getHeldBooking: vi.fn(async () => null) });
  expect((await handleCreateCheckout(d, { bookingId: 'b1', token: 'x' })).status).toBe(404);
  const e = deps({ getHeldBooking: vi.fn(async () => ({ id: 'b1', token: 'tok', ref: 'r', amount: 12, status: 'held', holdExpiresAt: '2000-01-01T00:00:00Z', routeName: 'x' })) });
  expect(await handleCreateCheckout(e, { bookingId: 'b1', token: 'tok' })).toMatchObject({ status: 409, body: { code: 'SALES_CLOSED' } });
});

const signed = (body: string, ts = String(Date.parse('2026-11-25T12:00:00Z'))) => ({
  'revolut-request-timestamp': ts, 'revolut-signature': 'v1=' + createHmac('sha256', 'wsk_1').update(`v1.${ts}.${body}`).digest('hex') });

test('webhook rejects bad signatures', async () => {
  const d = deps();
  const r = await handleWebhook(d, '{"event":"ORDER_COMPLETED","order_id":"ord_1"}', { 'revolut-request-timestamp': '1', 'revolut-signature': 'v1=00' });
  expect(r.status).toBe(401);
  expect(d.db.markPaid).not.toHaveBeenCalled();
});

test('ORDER_COMPLETED marks paid and sends ticket then invoice with PDF', async () => {
  const d = deps();
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1","merchant_order_ext_ref":"LJU-AAA111"}';
  expect((await handleWebhook(d, body, signed(body))).status).toBe(204);
  expect(d.db.markPaid).toHaveBeenCalledWith('b1', 'revolut', 'ord_1');
  expect(d.sent.map((m) => m.subject)).toEqual([expect.stringContaining('Your GoOpti transfer'), 'Invoice 2026-000001 · Markun Borut d.o.o.']);
  expect(d.sent[1].attachments).toHaveLength(1);
  expect(d.db.logEmail).toHaveBeenCalledTimes(2);
});

test('a repeated webhook does not send emails twice; other events are acknowledged', async () => {
  const d = deps({ markPaid: vi.fn(async () => ({ alreadyPaid: true })) });
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
  expect((await handleWebhook(d, body, signed(body))).status).toBe(204);
  expect(d.sent).toHaveLength(0);
  const other = '{"event":"ORDER_PAYMENT_DECLINED","order_id":"ord_1"}';
  expect((await handleWebhook(d, other, signed(other))).status).toBe(204);
});

test('a failing email is logged but the webhook still succeeds', async () => {
  const d = deps();
  d.send = vi.fn(async () => { throw new Error('smtp down'); });
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
  expect((await handleWebhook(d, body, signed(body))).status).toBe(204);
  expect(d.db.logEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'smtp down' }));
});

test('staff actions need the right role', async () => {
  const d = deps();
  expect((await handleStaffAction(d, null, { action: 'send-booking-emails', bookingId: 'b1' })).status).toBe(403);
  expect((await handleStaffAction(d, 'desk', { action: 'invite', email: 'x@y.z', role: 'desk', displayName: 'X' })).status).toBe(403);
  expect((await handleStaffAction(d, 'desk', { action: 'send-booking-emails', bookingId: 'b1' })).status).toBe(200);
  expect((await handleStaffAction(d, 'admin', { action: 'invite', email: 'x@y.z', role: 'desk', displayName: 'X' })).status).toBe(200);
  expect(d.inviteUser).toHaveBeenCalledWith('x@y.z', 'desk', 'X');
});

test('vehicle change re-sends updated tickets to every paid passenger', async () => {
  const d = deps({ bookingIdsOfDeparture: vi.fn(async () => ['b1', 'b2']) });
  await handleStaffAction(d, 'admin', { action: 'notify-vehicle-change', departureId: 'dep1' });
  expect(d.sent).toHaveLength(2);
  expect(d.sent[0].subject).toMatch(/^Updated: /);
});

test('a second checkout call reuses the existing Revolut order instead of creating a new one', async () => {
  const d = deps({ getHeldBooking: vi.fn(async () => ({ id: 'b1', token: 'tok', ref: 'r', amount: 12, status: 'held', holdExpiresAt: '2026-11-25T12:10:00Z',
    routeName: 'x', revolutOrderId: 'ord_0', checkoutUrl: 'https://checkout.revolut.com/payment-link/old' })) });
  const r = await handleCreateCheckout(d, { bookingId: 'b1', token: 'tok' });
  expect(r.body).toEqual({ checkoutUrl: 'https://checkout.revolut.com/payment-link/old' });
  expect(d.revolut).not.toHaveBeenCalled();
});

test('webhook falls back to the booking ref when the order id is unknown', async () => {
  const d = deps({ findByRevolutOrder: vi.fn(async () => null), findByRef: vi.fn(async () => 'b1') });
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_x","merchant_order_ext_ref":"LJU-AAA111"}';
  await handleWebhook(d, body, signed(body));
  expect(d.db.findByRef).toHaveBeenCalledWith('LJU-AAA111');
  expect(d.db.markPaid).toHaveBeenCalledWith('b1', 'revolut', 'ord_x');
});

test('a retried webhook sends the emails if the first attempt never did', async () => {
  const d = deps({ markPaid: vi.fn(async () => ({ alreadyPaid: true })), hasSentConfirmation: vi.fn(async () => false) });
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
  await handleWebhook(d, body, signed(body));
  expect(d.sent).toHaveLength(2);
});

test('a broken invoice PDF still lets the ticket email go out', async () => {
  const d = deps();
  d.pdf = vi.fn(async () => { throw new Error('pdf boom'); });
  const body = '{"event":"ORDER_COMPLETED","order_id":"ord_1"}';
  expect((await handleWebhook(d, body, signed(body))).status).toBe(204);
  expect(d.sent).toHaveLength(1);
  expect(d.db.logEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: 'invoice', status: 'failed', error: 'pdf boom' }));
});
