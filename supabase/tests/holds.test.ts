import { DESK, freshDb } from './setup';

async function base(seats = 8, extra: Record<string, unknown> = {}) {
  const t = await freshDb();
  const veh = await t.vehicle(seats);
  const dep = await t.departure({ vehicleId: veh, ...extra });
  return { t, veh, dep };
}
const left = async (t: Awaited<ReturnType<typeof freshDb>>, route = 'LJU-LJ') =>
  t.as<{ id: string; seats_left: number; private_price: number | null }>('anon', 'select * from list_departures($1)', [route]);

test('blocked + held + paid seats reduce availability; expired holds do not', async () => {
  const { t, dep } = await base(8, { blocked: 2 });
  const h = await t.hold(dep, 3);
  expect((await left(t))[0].seats_left).toBe(3);
  expect(await t.code('anon', `select hold_seats($1,'shared',4,'{"name":"B","email":"b@example.com"}','web')`, [dep])).toBe('SOLD_OUT');
  await t.db.query(`update bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [h.booking_id]);
  expect((await left(t))[0].seats_left).toBe(6);
});

test('the last seat can only be held once', async () => {
  const { t, dep } = await base(2);
  await t.hold(dep, 1, { email: 'a@example.com' });
  await t.hold(dep, 1, { email: 'b@example.com' });
  expect(await t.code('anon', `select hold_seats($1,'shared',1,'{"name":"C","email":"c@example.com"}','web')`, [dep])).toBe('SOLD_OUT');
  expect(await left(t)).toHaveLength(0);
});

test('private takes the whole van and is unavailable after a shared hold', async () => {
  const a = await base(8, { privatePrice: 90 });
  const h = await a.t.hold(a.dep, 2, { product: 'private' });
  expect(Number(h.amount)).toBe(90);
  expect(await left(a.t)).toHaveLength(0);
  const b = await base(8, { privatePrice: 90 });
  expect((await left(b.t))[0].private_price).not.toBeNull();
  await b.t.hold(b.dep, 1);
  expect((await left(b.t))[0].private_price).toBeNull();
  expect(await b.t.code('anon', `select hold_seats($1,'private',1,'{"name":"C","email":"c@example.com"}','web')`, [b.dep])).toBe('SOLD_OUT');
});

test('sales close N minutes before departure', async () => {
  const { t, dep } = await base(8, { inMinutes: 9, close: 10 });
  expect(await left(t)).toHaveLength(0);
  expect(await t.code('anon', `select hold_seats($1,'shared',1,'{"name":"C","email":"c@example.com"}','web')`, [dep])).toBe('SALES_CLOSED');
});

test('anon cannot read tables directly and the listing hides vehicle data', async () => {
  const { t } = await base();
  expect(await t.code('anon', 'select * from bookings')).toMatch(/permission denied/);
  expect(await t.code('anon', 'select * from vehicles')).toMatch(/permission denied/);
  const json = JSON.stringify(await left(t));
  expect(json).not.toContain('LJ-AB-123');
  expect(json).not.toContain('Kombi Secret');
});

test('web holds need an email, respect max passengers and the per-email hold limit; anon cannot use the desk channel', async () => {
  const { t, dep } = await base(20);
  expect(await t.code('anon', `select hold_seats($1,'shared',1,'{"name":"C"}','web')`, [dep])).toBe('INVALID');
  expect(await t.code('anon', `select hold_seats($1,'shared',9,'{"name":"C","email":"c@example.com"}','web')`, [dep])).toBe('INVALID');
  for (let i = 0; i < 3; i++) await t.hold(dep, 1, { email: 'same@example.com' });
  expect(await t.code('anon', `select hold_seats($1,'shared',1,'{"name":"C","email":"same@example.com"}','web')`, [dep])).toBe('INVALID');
  expect(await t.code('anon', `select hold_seats($1,'shared',1,'{"name":"C"}','desk')`, [dep])).toBe('FORBIDDEN');
});

test('mark_paid issues sequential invoices once, and the public view reveals the plate only when paid', async () => {
  const { t, dep } = await base();
  const a = await t.hold(dep, 1, { email: 'a@example.com' });
  const b = await t.hold(dep, 1, { email: 'b@example.com' });
  const pub = async (h: typeof a) => (await t.one<{ get_booking_public: { status: string; plate: string | null } }>('anon', 'select get_booking_public($1,$2)', [h.booking_id, h.token])).get_booking_public;
  expect((await pub(a)).plate).toBeNull();
  expect(await t.code('anon', `select mark_paid($1, 'revolut', 'ord_1')`, [a.booking_id])).toMatch(/permission denied/);
  const r1 = await t.one<{ mark_paid: { invoice: { number: string } } }>('service_role', `select mark_paid($1, 'revolut', 'ord_1')`, [a.booking_id]);
  const again = await t.one<{ mark_paid: { invoice: { number: string } } }>('service_role', `select mark_paid($1, 'revolut', 'ord_1')`, [a.booking_id]);
  const r2 = await t.one<{ mark_paid: { invoice: { number: string } } }>('service_role', `select mark_paid($1, 'revolut', 'ord_2')`, [b.booking_id]);
  const year = new Date().getFullYear();
  expect(r1.mark_paid.invoice.number).toBe(`${year}-000001`);
  expect(again.mark_paid.invoice.number).toBe(`${year}-000001`);
  expect(r2.mark_paid.invoice.number).toBe(`${year}-000002`);
  expect(await pub(a)).toMatchObject({ status: 'paid', plate: 'LJ-AB-123' });
  expect(await t.code('anon', 'select get_booking_public($1,$2)', [a.booking_id, 'wrong'])).toBe('NOT_FOUND');
});

test('a payment arriving after the hold expired and the seats were resold is flagged overbooked', async () => {
  const { t, dep } = await base(2);
  const a = await t.hold(dep, 2, { email: 'a@example.com' });
  await t.db.query(`update bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [a.booking_id]);
  const b = await t.hold(dep, 2, { email: 'b@example.com' });
  await t.as('service_role', `select mark_paid($1, 'revolut', 'ord_b')`, [b.booking_id]);
  const r = await t.one<{ mark_paid: { booking: { status: string } } }>('service_role', `select mark_paid($1, 'revolut', 'ord_a')`, [a.booking_id]);
  expect(r.mark_paid.booking.status).toBe('paid_overbooked');
});

test('desk_book books and pays in one step for staff only', async () => {
  const { t, dep } = await base();
  const sql = `select desk_book($1,'shared',2,'{"name":"Walk In"}'::jsonb,'desk_cash')`;
  expect(await t.code('anon', sql, [dep])).toMatch(/permission denied/);
  expect(await t.code('authenticated', sql, [dep])).toBe('FORBIDDEN');
  const r = await t.one<{ desk_book: { booking: { status: string; channel: string } } }>('authenticated', sql, [dep], DESK);
  expect(r.desk_book.booking).toMatchObject({ status: 'paid', channel: 'desk' });
  expect((await left(t))[0].seats_left).toBe(6);
});
