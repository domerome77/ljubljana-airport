// Revolut Merchant API helpers (verified against developer.revolut.com, API version 2026-09-22).
export interface RevolutConfig { baseUrl: string; secretKey: string; apiVersion: string }
export interface RevolutOrderInput {
  amountMinor: number; currency: 'EUR'; description: string; email?: string; reference: string; redirectUrl: string; expireAfter?: string;
}

export const REVOLUT_API_VERSION = '2026-09-22';
export const revolutBaseUrl = (env: string | undefined): string =>
  env === 'production' ? 'https://merchant.revolut.com' : 'https://sandbox-merchant.revolut.com';

export async function createRevolutOrder(cfg: RevolutConfig, o: RevolutOrderInput, fetchImpl: typeof fetch = fetch): Promise<{ id: string; checkoutUrl: string }> {
  const body: Record<string, unknown> = {
    amount: o.amountMinor, currency: o.currency, description: o.description,
    merchant_order_data: { reference: o.reference }, redirect_url: o.redirectUrl,
  };
  if (o.email) body.customer = { email: o.email };
  if (o.expireAfter) body.expire_pending_after = o.expireAfter;
  const res = await fetchImpl(`${cfg.baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${cfg.secretKey}`, 'Revolut-Api-Version': cfg.apiVersion },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Revolut create order failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string; checkout_url: string };
  return { id: j.id, checkoutUrl: j.checkout_url };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** HMAC-SHA256 over `v1.{timestamp}.{rawBody}`; header may hold several comma-separated `v1=` signatures; 5-minute tolerance. */
export async function verifyRevolutSignature(rawBody: string, timestamp: string, signatureHeader: string, secret: string, nowMs: number): Promise<boolean> {
  if (!rawBody || !timestamp || !signatureHeader || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > 5 * 60_000) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = 'v1=' + hex(await crypto.subtle.sign('HMAC', key, enc.encode(`v1.${timestamp}.${rawBody}`)));
  return signatureHeader.split(',').map((s) => s.trim()).some((s) => safeEqual(s, expected));
}
