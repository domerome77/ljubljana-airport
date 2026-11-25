import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { createRevolutOrder, verifyRevolutSignature } from '../../functions/_shared/revolut';

const secret = 'wsk_r59a4HfWVAKycbCaNO1RvgCJec02gRd8';
const body = '{"event": "ORDER_COMPLETED","order_id": "9fc01989-3f61-4484-a5d9-ffe768531be9","merchant_order_ext_ref": "Test #3928"}';
const ts = '1683650202360';
const sig = (b: string, t = ts, s = secret) => 'v1=' + createHmac('sha256', s).update(`v1.${t}.${b}`).digest('hex');

test('accepts a valid signature (also when several are sent)', async () => {
  expect(await verifyRevolutSignature(body, ts, sig(body), secret, Number(ts) + 1000)).toBe(true);
  expect(await verifyRevolutSignature(body, ts, `v1=${'0'.repeat(64)},${sig(body)}`, secret, Number(ts))).toBe(true);
});

test('rejects a tampered body, wrong secret or stale timestamp', async () => {
  expect(await verifyRevolutSignature(body + ' ', ts, sig(body), secret, Number(ts))).toBe(false);
  expect(await verifyRevolutSignature(body, ts, sig(body, ts, 'other'), secret, Number(ts))).toBe(false);
  expect(await verifyRevolutSignature(body, ts, sig(body), secret, Number(ts) + 5 * 60_000 + 1)).toBe(false);
  expect(await verifyRevolutSignature(body, ts, '', secret, Number(ts))).toBe(false);
});

test('createRevolutOrder sends minor units, version header, reference and redirect', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'ord_1', token: 'tk', checkout_url: 'https://checkout.revolut.com/payment-link/tk' }), { status: 201 }));
  const r = await createRevolutOrder(
    { baseUrl: 'https://sandbox-merchant.revolut.com', secretKey: 'sk_test', apiVersion: '2026-09-22' },
    { amountMinor: 4000, currency: 'EUR', description: 'LJU → Bled', email: 'a@b.co', reference: 'LJU-ABC123', redirectUrl: 'https://x.test/#/booking/1?t=2', expireAfter: 'PT15M' },
    fetchImpl,
  );
  expect(r).toEqual({ id: 'ord_1', checkoutUrl: 'https://checkout.revolut.com/payment-link/tk' });
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://sandbox-merchant.revolut.com/api/orders');
  expect((init.headers as Record<string, string>)['Revolut-Api-Version']).toBe('2026-09-22');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test');
  expect(JSON.parse(init.body as string)).toEqual({
    amount: 4000, currency: 'EUR', description: 'LJU → Bled', customer: { email: 'a@b.co' },
    merchant_order_data: { reference: 'LJU-ABC123' }, redirect_url: 'https://x.test/#/booking/1?t=2', expire_pending_after: 'PT15M',
  });
});

test('createRevolutOrder surfaces API errors', async () => {
  const fetchImpl = vi.fn(async () => new Response('{"code":"unauthenticated"}', { status: 401 }));
  await expect(createRevolutOrder({ baseUrl: 'https://m', secretKey: 'x', apiVersion: '2026-09-22' },
    { amountMinor: 1, currency: 'EUR', description: '', reference: 'r', redirectUrl: 'https://x' }, fetchImpl)).rejects.toThrow(/401/);
});
