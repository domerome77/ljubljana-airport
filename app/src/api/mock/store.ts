import type { Booking, Departure, Route, Settings, Vehicle } from '../../domain/types';
import type { StaffUser } from '../Api';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export interface EmailLogEntry { bookingId: string; kind: 'confirmation' | 'invoice' | 'credit_note' | 'update'; to: string; at: string }

export interface DemoState {
  version: 1;
  routes: Route[];
  vehicles: Vehicle[];
  departures: Departure[];
  bookings: Booking[];
  settings: Settings;
  staff: (StaffUser & { password: string })[];
  counters: Record<string, number>;
  emailLog: EmailLogEntry[];
}

export const STATE_KEY = 'goopti-lju-demo-v3';
export const SESSION_KEY = 'goopti-lju-demo-session';

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export function safeStorage(): StorageLike {
  try {
    const t = '__t';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export function load(storage: StorageLike): DemoState | null {
  try {
    const raw = storage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as DemoState) : null;
  } catch {
    return null;
  }
}

export function save(storage: StorageLike, s: DemoState): void {
  try { storage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* storage full or blocked: keep in memory */ }
}
