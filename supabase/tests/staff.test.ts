import { ADMIN, DESK, freshDb } from './setup';

test('desk cannot change settings or vehicles; admin can', async () => {
  const t = await freshDb();
  expect(await t.code('authenticated', `update settings set data = data where id = 1`, [], DESK)).toBe('OK');
  const rows = await t.as('authenticated', `update settings set data = jsonb_set(data, '{holdMinutes}', '20') where id = 1 returning id`, [], DESK);
  expect(rows).toHaveLength(0);
  expect(await t.code('authenticated', `insert into vehicles (plate, seats) values ('X', 8)`, [], DESK)).toMatch(/row-level security/);
  expect(await t.code('authenticated', `insert into vehicles (plate, seats) values ('X', 8)`, [], ADMIN)).toBe('OK');
  expect(await t.as('authenticated', `select id from vehicles`, [], DESK)).toHaveLength(1);
});

test('save_departure rejects a smaller van than what is taken, and price bounds', async () => {
  const t = await freshDb();
  const big = await t.vehicle(8);
  const small = await t.vehicle(6, 'LJ-SM-1', 'Small');
  const dep = await t.departure({ vehicleId: big });
  await t.as('authenticated', `select desk_book($1,'shared',7,'{"name":"G"}'::jsonb,'desk_card')`, [dep], DESK);
  const payload = (vehicleId: string, price = 12) => JSON.stringify({ id: dep, routeId: 'route-lj', vehicleId, departsAt: new Date(Date.now() + 7200e3).toISOString(),
    sellShared: true, sellPrivate: false, privatePrice: null, salesCloseMinutes: 10, blockedSeats: 0, tiers: [{ seatCount: 3, pricePerSeat: price }] });
  expect(await t.code('authenticated', 'select save_departure($1::jsonb)', [payload(small)], ADMIN)).toBe('CONFLICT');
  expect(await t.code('authenticated', 'select save_departure($1::jsonb)', [payload(big, 99)], ADMIN)).toBe('INVALID');
  expect(await t.code('authenticated', 'select save_departure($1::jsonb)', [payload(big)], DESK)).toBe('FORBIDDEN');
  expect(await t.code('authenticated', 'select save_departure($1::jsonb)', [payload(big, 13)], ADMIN)).toBe('OK');
});

test('cancel_departure refuses when paid bookings exist; cancel_booking issues a credit note', async () => {
  const t = await freshDb();
  const v = await t.vehicle(8);
  const dep = await t.departure({ vehicleId: v });
  const r = await t.one<{ desk_book: { booking: { id: string } } }>('authenticated', `select desk_book($1,'shared',1,'{"name":"G"}'::jsonb,'desk_card')`, [dep], DESK);
  expect(await t.code('authenticated', 'select cancel_departure($1)', [dep], ADMIN)).toBe('CONFLICT');
  const c = await t.one<{ cancel_booking: { credit_note: { number: string } } }>('authenticated', 'select cancel_booking($1)', [r.desk_book.booking.id], ADMIN);
  expect(c.cancel_booking.credit_note.number).toBe(`D-${new Date().getFullYear()}-000001`);
  expect(await t.code('authenticated', 'select cancel_departure($1)', [dep], ADMIN)).toBe('OK');
});

test('move_booking checks capacity on the target', async () => {
  const t = await freshDb();
  const v = await t.vehicle(8);
  const a = await t.departure({ vehicleId: v });
  const full = await t.departure({ vehicleId: v, inMinutes: 200, blocked: 8 });
  const free = await t.departure({ vehicleId: v, inMinutes: 300 });
  const r = await t.one<{ desk_book: { booking: { id: string } } }>('authenticated', `select desk_book($1,'shared',2,'{"name":"G"}'::jsonb,'desk_card')`, [a], DESK);
  expect(await t.code('authenticated', 'select move_booking($1,$2)', [r.desk_book.booking.id, full], ADMIN)).toBe('SOLD_OUT');
  expect(await t.code('authenticated', 'select move_booking($1,$2)', [r.desk_book.booking.id, free], ADMIN)).toBe('OK');
});

test('repeat_departure keeps Ljubljana local time across the DST change', async () => {
  const t = await freshDb();
  const v = await t.vehicle(8);
  const r = await t.db.query<{ id: string }>(`insert into departures (route_id, vehicle_id, departs_at, capacity, tiers) values ('route-lj', $1, '2026-03-27 13:30+00', 8, '[]') returning id`, [v]);
  const n = await t.one<{ repeat_departure: number }>('authenticated', `select repeat_departure($1, '2026-03-28', '2026-03-30', array[1,2,3,4,5,6,7])`, [r.rows[0].id], ADMIN);
  expect(n.repeat_departure).toBe(3);
  const times = await t.db.query<{ t: string }>(`select to_char(departs_at at time zone 'Europe/Ljubljana', 'YYYY-MM-DD HH24:MI') t from departures order by departs_at`);
  expect(times.rows.map((x) => x.t)).toEqual(['2026-03-27 14:30', '2026-03-28 14:30', '2026-03-29 14:30', '2026-03-30 14:30']);
});
