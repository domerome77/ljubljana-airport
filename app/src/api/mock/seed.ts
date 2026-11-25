import type { Booking, Departure, Route, Settings, Vehicle } from '../../domain/types';
import { addDaysYmd, localYmd, toUtcFromLocal } from '../../domain/time';
import { bookingRef, bookingToken, uuid } from '../ids';
import type { DemoState } from './store';

export function defaultSettings(): Settings {
  return {
    defaultSeatPrice: { 'LJU-LJ': 14, 'LJU-BLED': 25 },
    defaultPrivatePrice: { 'LJU-LJ': 70, 'LJU-BLED': 120 },
    tierTemplate: [{ seatCount: 3, pricePerSeat: 12 }, { seatCount: 3, pricePerSeat: 14 }],
    minSeatPrice: 5, maxSeatPrice: 60, minPrivatePrice: 30, maxPrivatePrice: 400,
    groupDiscounts: [{ minPassengers: 3, percent: 5 }, { minPassengers: 5, percent: 10 }],
    defaultSalesCloseMinutes: 10, holdMinutes: 15, maxPassengersOnline: 8,
    company: {
      name: 'Markun Borut d.o.o.', address: 'Address to be provided', vatId: 'SI00000000', regNo: '0000000000',
      iban: 'SI56 0000 0000 0000 000', email: 'info@example.com', phone: '+386 00 000 000',
    },
    vatRate: 0.095, invoicePrefix: '',
    meetingPoint: {
      imageUrl: 'assets/meeting-point-mock.svg',
      text: 'Exit the arrivals hall, turn right and walk to the GoOpti van bay (P) — about 2 minutes. Look for the plate on your ticket.',
    },
    supportPhone: '+386 00 000 000',
  };
}

export function baseRoutes(): Route[] {
  return [
    { id: 'route-lj', code: 'LJU-LJ', name: 'Ljubljana Airport → Ljubljana', destinationLabel: 'Ljubljana — any address', active: true },
    { id: 'route-bled', code: 'LJU-BLED', name: 'Ljubljana Airport → Bled', destinationLabel: 'Bled — any address', active: true },
  ];
}

export function emptyState(): DemoState {
  return {
    version: 1,
    routes: baseRoutes(),
    vehicles: [],
    departures: [],
    bookings: [],
    settings: defaultSettings(),
    staff: [
      { id: 'staff-admin', email: 'admin@demo', role: 'admin', displayName: 'Demo Admin', password: 'demo' },
      { id: 'staff-desk', email: 'desk@demo', role: 'desk', displayName: 'Demo Desk', password: 'demo' },
    ],
    counters: {},
    emailLog: [],
  };
}

/** Realistic demo timetable: today + tomorrow, both routes, a few seats already sold. */
export function demoState(nowIso: string): DemoState {
  const s = emptyState();
  const vehicles: Vehicle[] = [
    { id: uuid(), internalName: 'Kombi 1', plate: 'LJ-AB-123', seats: 8, active: true },
    { id: uuid(), internalName: 'Kombi 2', plate: 'LJ-CD-456', seats: 8, active: true },
    { id: uuid(), internalName: 'Vito', plate: 'LJ-EF-789', seats: 6, active: true },
  ];
  s.vehicles = vehicles;
  const today = localYmd(nowIso);
  const minStart = Date.parse(nowIso) + 20 * 60_000;
  const plan: { route: Route; times: string[] }[] = [
    { route: s.routes[0], times: ['06:30', '07:30', '08:45', '10:00', '11:15', '12:30', '13:45', '15:00', '16:15', '17:30', '18:45', '20:00', '21:15', '22:30'] },
    { route: s.routes[1], times: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:30'] },
  ];
  let i = 0;
  for (const day of [today, addDaysYmd(today, 1)]) {
    for (const { route, times } of plan) {
      for (const t of times) {
        const departsAt = toUtcFromLocal(day, t);
        if (Date.parse(departsAt) < minStart) continue;
        const v = vehicles[i % vehicles.length];
        const dep: Departure = {
          id: uuid(), routeId: route.id, vehicleId: v.id, departsAt, capacity: v.seats, sellShared: true, sellPrivate: true,
          privatePrice: null, salesCloseMinutes: s.settings.defaultSalesCloseMinutes, blockedSeats: i % 5 === 2 ? 2 : 0,
          blockedNote: i % 5 === 2 ? 'Sold via GoOpti' : undefined, status: 'scheduled', tiers: s.settings.tierTemplate.map((x) => ({ ...x })),
        };
        s.departures.push(dep);
        const sold = [0, 3, 1, 5, 0, 2][i % 6];
        if (sold > 0) s.bookings.push(seedBooking(dep, sold, nowIso, i));
        i++;
      }
    }
  }
  return s;
}

function seedBooking(dep: Departure, seats: number, nowIso: string, i: number): Booking {
  const amount = seats * dep.tiers[0].pricePerSeat;
  return {
    id: uuid(), ref: bookingRef(), token: bookingToken(), departureId: dep.id, product: 'shared', passengers: seats,
    seatsTaken: seats, amount, breakdown: [{ label: `${seats} × ${dep.tiers[0].pricePerSeat.toFixed(2)} €`, amount }],
    buyer: { name: `Demo Passenger ${i + 1}`, email: `passenger${i + 1}@example.com` }, channel: i % 2 ? 'desk' : 'web',
    status: 'paid', holdExpiresAt: null, paymentMethod: i % 2 ? 'desk_card' : 'revolut', paidAt: nowIso, createdAt: nowIso,
    invoiceNumber: null, creditNoteNumber: null,
  };
}
