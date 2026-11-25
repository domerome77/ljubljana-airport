const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomCode(len: number): string {
  return [...randomBytes(len)].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

export const bookingRef = (): string => `LJU-${randomCode(6)}`;
export const bookingToken = (): string => randomCode(24);
