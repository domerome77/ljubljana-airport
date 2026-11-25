import { minutesUntil } from '../domain/time';

export function relativeIn(iso: string, nowIso: string): string | null {
  const m = minutesUntil(iso, nowIso);
  if (m < 0 || m >= 180) return null;
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `in ${h} h ${r} min` : `in ${h} h`;
}

export const seatsText = (n: number): string => (n === 1 ? '1 seat left' : `${n} seats left`);
