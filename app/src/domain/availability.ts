import type { Departure } from './types';

export function seatsLeft(capacity: number, blocked: number, takenActive: number): number {
  return Math.max(0, capacity - blocked - takenActive);
}

export function isSellable(departsAtIso: string, salesCloseMinutes: number, nowIso: string): boolean {
  return Date.parse(nowIso) < Date.parse(departsAtIso) - salesCloseMinutes * 60_000;
}

export function privateAvailable(dep: Pick<Departure, 'capacity' | 'sellPrivate'>, seatsLeftNow: number): boolean {
  return dep.sellPrivate && seatsLeftNow === dep.capacity;
}
