import { vi } from 'vitest';
import type { PublicApi, PublicBookingView } from '../../src/api/Api';
import type { PublicDeparture, RouteCode } from '../../src/domain/types';

export const NOW = '2026-11-25T13:05:00.000Z'; // 14:05 Ljubljana

export const deps: Record<RouteCode, PublicDeparture[]> = {
  'LJU-LJ': [
    { id: 'd1', routeCode: 'LJU-LJ', departsAt: '2026-11-25T13:30:00.000Z', seatsLeft: 2, capacity: 8, sharedFromPrice: 12, privatePrice: null },
    { id: 'd2', routeCode: 'LJU-LJ', departsAt: '2026-11-25T15:00:00.000Z', seatsLeft: 8, capacity: 8, sharedFromPrice: 12, privatePrice: 70 },
    { id: 'd3', routeCode: 'LJU-LJ', departsAt: '2026-11-26T07:00:00.000Z', seatsLeft: 6, capacity: 6, sharedFromPrice: 14, privatePrice: 70 },
  ],
  'LJU-BLED': [
    { id: 'b1', routeCode: 'LJU-BLED', departsAt: '2026-11-25T14:00:00.000Z', seatsLeft: 8, capacity: 8, sharedFromPrice: 25, privatePrice: 120 },
  ],
};

export const paidView: PublicBookingView = {
  ref: 'LJU-7K3F9Q', status: 'paid', routeCode: 'LJU-LJ', routeName: 'Ljubljana Airport → Ljubljana', destinationLabel: 'Ljubljana — any address',
  departsAt: '2026-11-25T13:30:00.000Z', product: 'shared', passengers: 2, amount: 24, lines: [{ label: '2 × 12.00 €', amount: 24 }],
  plate: 'LJ-AB-123', meetingPoint: { imageUrl: 'assets/meeting-point-mock.svg', text: 'Turn right after arrivals.' },
  supportPhone: '+386 00 000 000', buyerName: 'Ana Novak', holdExpiresAt: null,
};

export function fakeApi(overrides: Partial<PublicApi> = {}): PublicApi {
  return {
    listDepartures: vi.fn(async (r: RouteCode) => deps[r]),
    quote: vi.fn(async (_id: string, product, passengers: number) =>
      product === 'private'
        ? { amount: 70, lines: [{ label: 'Private van', amount: 70 }], seatsLeft: 8 }
        : { amount: 12 * passengers, lines: [{ label: `${passengers} × 12.00 €`, amount: 12 * passengers }], seatsLeft: 8 }),
    hold: vi.fn(async () => ({ bookingId: 'bk1', token: 'tok', amount: 24, lines: [], holdExpiresAt: NOW })),
    startCheckout: vi.fn(async () => ({ checkoutUrl: 'https://checkout.revolut.com/pay/x' })),
    getBooking: vi.fn(async () => paidView),
    ...overrides,
  };
}
