import { vi } from 'vitest';
import { ApiError } from '../../src/api/Api';
import { SupabaseApi, type SupabaseLike } from '../../src/api/supabase/SupabaseApi';

function client(over: Partial<Record<string, unknown>> = {}) {
  const rpc = vi.fn(async (fn: string): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: { message: `no stub for ${fn}` } }));
  const invoke = vi.fn(async () => ({ data: { checkoutUrl: 'https://checkout.revolut.com/pay/abc' }, error: null }));
  const single = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'order', 'update', 'upsert', 'insert']) q[k] = vi.fn(() => q);
    q.maybeSingle = single; q.single = single;
    return q;
  });
  const auth = {
    signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'x@y.z' } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => ({ data: { session: null } })),
  };
  return { rpc, functions: { invoke }, from, auth, single, ...over } as unknown as SupabaseLike & { rpc: typeof rpc; single: typeof single; functions: { invoke: typeof invoke }; auth: typeof auth };
}

test('maps list_departures rows to camelCase numbers', async () => {
  const c = client();
  c.rpc.mockResolvedValueOnce({ data: [{ id: 'd1', route_code: 'LJU-LJ', departs_at: '2026-11-25T13:30:00+00:00', seats_left: 3, capacity: 8, shared_from_price: '12.00', private_price: null }], error: null });
  const api = new SupabaseApi(c);
  expect(await api.listDepartures('LJU-LJ')).toEqual([
    { id: 'd1', routeCode: 'LJU-LJ', departsAt: '2026-11-25T13:30:00+00:00', seatsLeft: 3, capacity: 8, sharedFromPrice: 12, privatePrice: null },
  ]);
  expect(c.rpc).toHaveBeenCalledWith('list_departures', { p_route: 'LJU-LJ' });
});

test('maps Postgres error codes to ApiError', async () => {
  const c = client();
  c.rpc.mockResolvedValueOnce({ data: null, error: { message: 'SOLD_OUT', details: 'Those seats were just taken', code: 'P0001' } });
  const api = new SupabaseApi(c);
  const err = await api.hold({ departureId: 'd1', product: 'shared', passengers: 2, buyer: { name: 'A', email: 'a@b.co' }, channel: 'web' }).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe('SOLD_OUT');
  expect(err.message).toBe('Those seats were just taken');
});

test('hold sends buyer and maps the result', async () => {
  const c = client();
  c.rpc.mockResolvedValueOnce({ data: { booking_id: 'b1', token: 't', amount: 24, lines: [], hold_expires_at: 'x' }, error: null });
  const r = await new SupabaseApi(c).hold({ departureId: 'd1', product: 'shared', passengers: 2, buyer: { name: 'A', email: 'a@b.co' }, channel: 'web' });
  expect(r).toEqual({ bookingId: 'b1', token: 't', amount: 24, lines: [], holdExpiresAt: 'x' });
  expect(c.rpc).toHaveBeenCalledWith('hold_seats', { p_departure: 'd1', p_product: 'shared', p_passengers: 2, p_buyer: { name: 'A', email: 'a@b.co' }, p_channel: 'web' });
});

test('startCheckout invokes the create-checkout function', async () => {
  const c = client();
  const r = await new SupabaseApi(c).startCheckout('b1', 'tok');
  expect(r.checkoutUrl).toBe('https://checkout.revolut.com/pay/abc');
  expect(c.functions.invoke).toHaveBeenCalledWith('create-checkout', { body: { bookingId: 'b1', token: 'tok' } });
});

test('signIn requires a staff row', async () => {
  const c = client();
  const api = new SupabaseApi(c);
  c.single.mockResolvedValueOnce({ data: null, error: null });
  expect((await api.signIn('x@y.z', 'pw').catch((e) => e)).code).toBe('FORBIDDEN');
  expect(c.auth.signOut).toHaveBeenCalled();
  c.single.mockResolvedValueOnce({ data: { user_id: 'u1', email: 'x@y.z', role: 'admin', display_name: 'X', active: true }, error: null });
  expect(await api.signIn('x@y.z', 'pw')).toEqual({ id: 'u1', email: 'x@y.z', role: 'admin', displayName: 'X' });
});

test('deskBook pays in SQL and asks the function to send emails only when an email is given', async () => {
  const c = client();
  c.rpc.mockResolvedValue({ data: { booking: { id: 'b1', token: 't' } }, error: null });
  const api = new SupabaseApi(c);
  await api.deskBook({ departureId: 'd1', product: 'shared', passengers: 1, buyer: { name: 'A' }, channel: 'desk', paymentMethod: 'desk_cash' });
  expect(c.functions.invoke).not.toHaveBeenCalled();
  await api.deskBook({ departureId: 'd1', product: 'shared', passengers: 1, buyer: { name: 'A', email: 'a@b.co' }, channel: 'desk', paymentMethod: 'desk_cash' });
  expect(c.functions.invoke).toHaveBeenCalledWith('staff-actions', { body: { action: 'send-booking-emails', bookingId: 'b1' } });
});
