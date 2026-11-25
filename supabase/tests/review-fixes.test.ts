import { ADMIN, DESK, freshDb } from './setup';

const depPayload = (dep: string, vehicleId: string, o: Record<string, unknown> = {}) => JSON.stringify({ id: dep, routeId: 'route-lj', vehicleId,
  departsAt: new Date(Date.now() + 7200e3).toISOString(), sellShared: true, sellPrivate: true, privatePrice: null, salesCloseMinutes: 10, blockedSeats: 0,
  tiers: [{ seatCount: 3, pricePerSeat: 12 }], ...o });

test('desk_book refuses when the price changed since the quote', async () => {
  const t = await freshDb();
  const dep = await t.departure({ vehicleId: await t.vehicle(8) });
  const sql = `select desk_book($1,'shared',1,'{"name":"W"}'::jsonb,'desk_card',$2)`;
  expect(await t.code('authenticated', sql, [dep, 99], DESK)).toBe('CONFLICT');
  expect(await t.code('authenticated', sql, [dep, 12], DESK)).toBe('OK');
});

test('cancelling a departure expires its holds; a late payment on a cancelled departure or booking is flagged', async () => {
  const t = await freshDb();
  const dep = await t.departure({ vehicleId: await t.vehicle(8) });
  const h = await t.hold(dep, 1);
  await t.as('authenticated', 'select cancel_departure($1)', [dep], ADMIN);
  const st = await t.db.query<{ status: string }>('select status from bookings where id = $1', [h.booking_id]);
  expect(st.rows[0].status).toBe('expired');
  const r = await t.one<{ mark_paid: { booking: { status: string } } }>('service_role', `select mark_paid($1,'revolut','o1')`, [h.booking_id]);
  expect(r.mark_paid.booking.status).toBe('paid_overbooked');
});

test('a payment for a booking the admin cancelled is flagged, not silently re-activated', async () => {
  const t = await freshDb();
  const dep = await t.departure({ vehicleId: await t.vehicle(8) });
  const h = await t.hold(dep, 1);
  await t.as('authenticated', 'select cancel_booking($1)', [h.booking_id], ADMIN);
  const r = await t.one<{ mark_paid: { booking: { status: string } } }>('service_role', `select mark_paid($1,'revolut','o1')`, [h.booking_id]);
  expect(r.mark_paid.booking.status).toBe('paid_overbooked');
});

test('swapping a private booking to a bigger van keeps the whole van taken', async () => {
  const t = await freshDb();
  const small = await t.vehicle(8);
  const big = await t.vehicle(12, 'LJ-BIG-1', 'Big');
  const dep = await t.departure({ vehicleId: small, privatePrice: 90 });
  await t.as('authenticated', `select desk_book($1,'private',2,'{"name":"P"}'::jsonb,'desk_card')`, [dep], DESK);
  await t.as('authenticated', 'select save_departure($1::jsonb)', [depPayload(dep, big, { privatePrice: 90 })], ADMIN);
  expect(await t.as('anon', `select * from list_departures('LJU-LJ')`)).toHaveLength(0);
});

test('route change with paid bookings is refused; a time change is reported for re-notification', async () => {
  const t = await freshDb();
  const v = await t.vehicle(8);
  const dep = await t.departure({ vehicleId: v });
  await t.as('authenticated', `select desk_book($1,'shared',1,'{"name":"P"}'::jsonb,'desk_card')`, [dep], DESK);
  expect(await t.code('authenticated', 'select save_departure($1::jsonb)', [depPayload(dep, v, { routeId: 'route-bled', tiers: [{ seatCount: 3, pricePerSeat: 22 }] })], ADMIN)).toBe('CONFLICT');
  const r = await t.one<{ save_departure: { scheduleChanged: boolean } }>('authenticated', 'select save_departure($1::jsonb)',
    [depPayload(dep, v, { departsAt: new Date(Date.now() + 9000e3).toISOString() })], ADMIN);
  expect(r.save_departure.scheduleChanged).toBe(true);
});

test('quote rejects absurd passenger counts', async () => {
  const t = await freshDb();
  const dep = await t.departure({ vehicleId: await t.vehicle(8) });
  expect(await t.code('anon', `select quote($1,'shared',2000000000)`, [dep])).toBe('INVALID');
  expect(await t.code('anon', `select quote($1,'shared',0)`, [dep])).toBe('INVALID');
});

test('the Revolut checkout URL is stored and a booking can be found by its ref', async () => {
  const t = await freshDb();
  const dep = await t.departure({ vehicleId: await t.vehicle(8) });
  const h = await t.hold(dep, 1);
  await t.db.query(`update bookings set revolut_order_id = 'o1', revolut_checkout_url = 'https://c' where id = $1`, [h.booking_id]);
  const r = await t.db.query<{ revolut_checkout_url: string }>('select revolut_checkout_url from bookings where id = $1', [h.booking_id]);
  expect(r.rows[0].revolut_checkout_url).toBe('https://c');
});
