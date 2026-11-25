export type RouteCode = 'LJU-LJ' | 'LJU-BLED';
export type Product = 'shared' | 'private';
export type Channel = 'web' | 'desk';
export type BookingStatus = 'held' | 'paid' | 'paid_overbooked' | 'cancelled' | 'expired';
export type PaymentMethod = 'revolut' | 'desk_card' | 'desk_cash';
export type StaffRole = 'admin' | 'desk';

export interface PriceTier { seatCount: number; pricePerSeat: number }
export interface GroupDiscount { minPassengers: number; percent: number }
export interface Route { id: string; code: RouteCode; name: string; destinationLabel: string; active: boolean }
export interface Vehicle { id: string; internalName: string; plate: string; seats: number; active: boolean; notes?: string }

export interface Departure {
  id: string; routeId: string; vehicleId: string; departsAt: string; capacity: number;
  sellShared: boolean; sellPrivate: boolean; privatePrice: number | null; salesCloseMinutes: number;
  blockedSeats: number; blockedNote?: string; status: 'scheduled' | 'cancelled'; tiers: PriceTier[]; notes?: string;
}

export interface CompanyInfo { name: string; address: string; vatId: string; regNo: string; iban: string; email: string; phone: string }

export interface Settings {
  defaultSeatPrice: Record<RouteCode, number>;
  defaultPrivatePrice: Record<RouteCode, number>;
  tierTemplate: Record<RouteCode, PriceTier[]>;
  minSeatPrice: number; maxSeatPrice: number; minPrivatePrice: number; maxPrivatePrice: number;
  groupDiscounts: GroupDiscount[];
  defaultSalesCloseMinutes: number; holdMinutes: number; maxPassengersOnline: number;
  company: CompanyInfo; vatRate: number; invoicePrefix: string;
  meetingPoint: { imageUrl: string; text: string }; supportPhone: string;
}

export interface BuyerCompany { name: string; address: string; vatId: string }
export interface Buyer { name: string; email?: string; phone?: string; company?: BuyerCompany }
export interface QuoteLine { label: string; amount: number }
export interface Quote { amount: number; lines: QuoteLine[]; seatsLeft: number }

export interface Booking {
  id: string; ref: string; token: string; departureId: string; product: Product; passengers: number;
  seatsTaken: number; amount: number; breakdown: QuoteLine[]; buyer: Buyer; channel: Channel; status: BookingStatus;
  holdExpiresAt: string | null; paymentMethod: PaymentMethod | null; paidAt: string | null; createdAt: string;
  invoiceNumber?: string | null; creditNoteNumber?: string | null;
}

export interface PublicDeparture {
  id: string; routeCode: RouteCode; departsAt: string; seatsLeft: number; capacity: number;
  sharedFromPrice: number | null; privatePrice: number | null;
}
