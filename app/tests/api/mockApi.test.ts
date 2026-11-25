import { MockApi, memoryStorage } from '../../src/api/mock/MockApi';
import { ApiError } from '../../src/api/Api';

const T0 = '2026-11-25T10:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

async function setup(opts: { seats?: number; blocked?: number; departIn?: number } = {}) {
  let now = T0;
  const api = new MockApi({ now: () => now, storage: memoryStorage(), seed: 'empty' });
  await api.signIn('admin@demo', 'demo');
  const routes = await api.listRoutes();
  const lj = routes.find((r) => r.code === 'LJU-LJ')!;
  const v = await api.saveVehicle({ internalName: 'Kombi Secret', plate: 'LJ-AB-123', seats: opts.seats ?? 8, active: true });
  const d = await api.saveDeparture({
    routeId: lj.id, vehicleId: v.id, departsAt: at(opts.departIn ?? 120), sellShared: true, sellPrivate: true,
    privatePrice: 90, salesCloseMinutes: 10, blockedSeats: opts.blocked ?? 0, tiers: [{ seatCount: 3, pricePerSeat: 12 }],
  });
  await api.signOut();
  return { api, d, v, lj, setNow: (iso: string) => { now = iso; } };
}
const buyer = { name: 'Ana Novak', email: 'ana@example.com' };
const codeOf = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return (e as ApiError).code; } };

test('public listing hides internal vehicle data and is sorted', async () => {
  const { api } = await setup();
  const list = await api.listDepartures('LJU-LJ');
  expect(list).toHaveLength(1);
  const json = JSON.stringify(list);
  expect(json).not.toContain('Kombi Secret');
  expect(json).not.toContain('LJ-AB-123');
  expect(list[0].sharedFromPrice).toBe(12);
});

test('holds and blocked seats reduce availability; overflow is SOLD_OUT', async () => {
  const { api, d } = await setup({ blocked: 2 });
  await api.hold({ departureId: d.id, product: 'shared', passengers: 3, buyer, channel: 'web' });
  expect((await api.listDepartures('LJU-LJ'))[0].seatsLeft).toBe(3);
  expect(await codeOf(api.hold({ departureId: d.id, product: 'shared', passengers: 4, buyer, channel: 'web' }))).toBe('SOLD_OUT');
});

test('expired holds release seats', async () => {
  const { api, d, setNow } = await setup();
  await api.hold({ departureId: d.id, product: 'shared', passengers: 8, buyer, channel: 'web' });
  expect(await api.listDepartures('LJU-LJ')).toHaveLength(0);
  setNow(at(16));
  expect((await api.listDepartures('LJU-LJ'))[0].seatsLeft).toBe(8);
});

test('private takes the whole van and is unavailable after a shared hold', async () => {
  const a = await setup();
  const h = await a.api.hold({ departureId: a.d.id, product: 'private', passengers: 2, buyer, channel: 'web' });
  expect(h.amount).toBe(90);
  expect(await a.api.listDepartures('LJU-LJ')).toHaveLength(0);
  const b = await setup();
  await b.api.hold({ departureId: b.d.id, product: 'shared', passengers: 1, buyer, channel: 'web' });
  expect((await b.api.listDepartures('LJU-LJ'))[0].privatePrice).toBeNull();
  expect(await codeOf(b.api.hold({ departureId: b.d.id, product: 'private', passengers: 1, buyer, channel: 'web' }))).toBe('SOLD_OUT');
});

test('sales close before departure', async () => {
  const { api, d } = await setup({ departIn: 9 });
  expect(await api.listDepartures('LJU-LJ')).toHaveLength(0);
  expect(await codeOf(api.hold({ departureId: d.id, product: 'shared', passengers: 1, buyer, channel: 'web' }))).toBe('SALES_CLOSED');
});

test('web hold requires an email and respects max passengers', async () => {
  const { api, d } = await setup({ seats: 20 });
  expect(await codeOf(api.hold({ departureId: d.id, product: 'shared', passengers: 1, buyer: { name: 'X' }, channel: 'web' }))).toBe('INVALID');
  expect(await codeOf(api.hold({ departureId: d.id, product: 'shared', passengers: 9, buyer, channel: 'web' }))).toBe('INVALID');
});

test('admin cannot block or swap below what is taken, nor cancel a sold departure', async () => {
  const { api, d, v } = await setup();
  const h = await api.hold({ departureId: d.id, product: 'shared', passengers: 7, buyer, channel: 'web' });
  api.confirmPayment(h.bookingId);
  await api.signIn('admin@demo', 'demo');
  const small = await api.saveVehicle({ internalName: 'Small', plate: 'LJ-SM-1', seats: 6, active: true });
  const base = { ...d, vehicleId: v.id };
  expect(await codeOf(api.saveDeparture({ ...base, blockedSeats: 2 }))).toBe('CONFLICT');
  expect(await codeOf(api.saveDeparture({ ...base, vehicleId: small.id }))).toBe('CONFLICT');
  expect(await codeOf(api.cancelDeparture(d.id))).toBe('CONFLICT');
});

test('checkout, payment and public booking view', async () => {
  const { api, d } = await setup();
  const h = await api.hold({ departureId: d.id, product: 'shared', passengers: 2, buyer, channel: 'web' });
  expect(h.amount).toBe(24);
  const { checkoutUrl } = await api.startCheckout(h.bookingId, h.token);
  expect(checkoutUrl).toBe(`#/booking/${h.bookingId}?t=${h.token}&demo=pay`);
  expect((await api.getBooking(h.bookingId, h.token)).plate).toBeNull();
  api.confirmPayment(h.bookingId);
  const view = await api.getBooking(h.bookingId, h.token);
  expect(view.status).toBe('paid');
  expect(view.plate).toBe('LJ-AB-123');
  expect(await codeOf(api.getBooking(h.bookingId, 'wrong'))).toBe('NOT_FOUND');
});

test('staff methods require sign-in and the right role', async () => {
  const { api, d } = await setup();
  expect(await codeOf(api.listVehicles())).toBe('FORBIDDEN');
  await api.signIn('desk@demo', 'demo');
  expect(await codeOf(api.listVehicles())).toBe('FORBIDDEN');
  const r = await api.deskBook({ departureId: d.id, product: 'shared', passengers: 2, buyer: { name: 'Walk In' }, channel: 'desk', paymentMethod: 'desk_cash' });
  expect((await api.getBooking(r.bookingId, r.token)).status).toBe('paid');
  expect(await codeOf(api.signIn('desk@demo', 'nope'))).toBe('FORBIDDEN');
});

test('moving a booking to a full departure is SOLD_OUT; cancelling paid issues a credit note', async () => {
  const { api, d, v, lj } = await setup();
  await api.signIn('admin@demo', 'demo');
  const full = await api.saveDeparture({ routeId: lj.id, vehicleId: v.id, departsAt: at(200), sellShared: true, sellPrivate: false,
    privatePrice: null, salesCloseMinutes: 10, blockedSeats: 8, tiers: [] });
  const r = await api.deskBook({ departureId: d.id, product: 'shared', passengers: 1, buyer: { name: 'A' }, channel: 'desk', paymentMethod: 'desk_card' });
  expect(await codeOf(api.moveBooking(r.bookingId, full.id))).toBe('SOLD_OUT');
  await api.cancelBooking(r.bookingId);
  const [b] = await api.listBookings({ text: 'A' });
  expect(b.status).toBe('cancelled');
  expect(b.creditNoteNumber).toMatch(/^D-2026-\d{6}$/);
  expect(b.invoiceNumber).toMatch(/^2026-\d{6}$/);
});

test('repeatDeparture creates one per selected weekday in range', async () => {
  const { api, d } = await setup();
  await api.signIn('admin@demo', 'demo');
  // 2026-11-30 is a Monday; two weeks Mon–Fri
  const n = await api.repeatDeparture(d.id, '2026-11-30', '2026-12-13', [1, 2, 3, 4, 5]);
  expect(n).toBe(10);
});

test('demo seed prices Bled with its own tier template', async () => {
  const api = new MockApi({ now: () => T0, storage: memoryStorage(), seed: 'demo' });
  const bled = await api.listDepartures('LJU-BLED');
  expect(bled.length).toBeGreaterThan(0);
  expect(Math.min(...bled.map((d) => d.sharedFromPrice ?? 99))).toBeGreaterThanOrEqual(22);
});

describe('review fixes (parity with SQL)', () => {
  test('desk booking refuses when the price changed since the quote', async () => {
    const { api, d } = await setup();
    await api.signIn('desk@demo', 'demo');
    expect(await codeOf(api.deskBook({ departureId: d.id, product: 'shared', passengers: 1, buyer: { name: 'W' }, channel: 'desk', paymentMethod: 'desk_card', expectedAmount: 99 }))).toBe('CONFLICT');
    expect(await codeOf(api.deskBook({ departureId: d.id, product: 'shared', passengers: 1, buyer: { name: 'W' }, channel: 'desk', paymentMethod: 'desk_card', expectedAmount: 12 }))).toBe('OK');
  });

  test('cancelling a departure expires holds; late payment for a cancelled departure is flagged', async () => {
    const { api, d } = await setup();
    const h = await api.hold({ departureId: d.id, product: 'shared', passengers: 1, buyer, channel: 'web' });
    await api.signIn('admin@demo', 'demo');
    await api.cancelDeparture(d.id);
    api.confirmPayment(h.bookingId);
    const [b] = await api.listBookings({});
    expect(b.status).toBe('paid_overbooked');
  });

  test('private booking follows a swap to a bigger van; route change with paid bookings is refused', async () => {
    const { api, d, v } = await setup();
    await api.signIn('admin@demo', 'demo');
    const big = await api.saveVehicle({ internalName: 'Big', plate: 'LJ-BIG-1', seats: 12, active: true });
    await api.deskBook({ departureId: d.id, product: 'private', passengers: 2, buyer: { name: 'P' }, channel: 'desk', paymentMethod: 'desk_card' });
    await api.saveDeparture({ ...d, vehicleId: big.id });
    expect(await api.listDepartures('LJU-LJ')).toHaveLength(0);
    const routes = await api.listRoutes();
    const bled = routes.find((r) => r.code === 'LJU-BLED')!;
    expect(await codeOf(api.saveDeparture({ ...d, vehicleId: big.id, routeId: bled.id, tiers: [{ seatCount: 3, pricePerSeat: 22 }] }))).toBe('CONFLICT');
    void v;
  });
});
