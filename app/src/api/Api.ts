import type {
  Booking, BookingStatus, Buyer, Channel, Departure, Product, PublicDeparture, Quote, QuoteLine, Route, RouteCode,
  Settings, StaffRole, Vehicle,
} from '../domain/types';

export type ApiErrorCode = 'SOLD_OUT' | 'SALES_CLOSED' | 'INVALID' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'NETWORK';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export interface HoldInput { departureId: string; product: Product; passengers: number; buyer: Buyer; channel: Channel }
export interface HoldResult { bookingId: string; token: string; amount: number; lines: QuoteLine[]; holdExpiresAt: string }

export interface PublicBookingView {
  ref: string; status: BookingStatus; routeCode: RouteCode; routeName: string; destinationLabel: string; departsAt: string;
  product: Product; passengers: number; amount: number; lines: QuoteLine[]; plate: string | null;
  meetingPoint: Settings['meetingPoint']; supportPhone: string; buyerName: string; holdExpiresAt: string | null;
}

export interface PublicApi {
  listDepartures(route: RouteCode): Promise<PublicDeparture[]>;
  quote(departureId: string, product: Product, passengers: number): Promise<Quote>;
  hold(input: HoldInput): Promise<HoldResult>;
  startCheckout(bookingId: string, token: string): Promise<{ checkoutUrl: string }>;
  getBooking(bookingId: string, token: string): Promise<PublicBookingView>;
}

export interface StaffUser { id: string; email: string; role: StaffRole; displayName: string }

export interface DepartureAdminView extends Departure {
  routeCode: RouteCode; plate: string; vehicleName: string;
  soldSeats: number; heldSeats: number; seatsLeft: number; revenue: number; problems: string[];
}

export type DeskBookInput = HoldInput & { paymentMethod: 'desk_card' | 'desk_cash'; expectedAmount?: number };
export type DepartureInput = Omit<Departure, 'id' | 'capacity' | 'status'> & { id?: string };
export type VehicleInput = Omit<Vehicle, 'id'> & { id?: string };
export type BookingRow = Booking & { departsAt: string; routeCode: RouteCode; plate: string };

export interface StaffApi {
  signIn(email: string, password: string): Promise<StaffUser>;
  signOut(): Promise<void>;
  me(): Promise<StaffUser | null>;
  listRoutes(): Promise<Route[]>;
  listVehicles(): Promise<Vehicle[]>;
  saveVehicle(v: VehicleInput): Promise<Vehicle>;
  listDeparturesAdmin(fromIso: string, toIso: string): Promise<DepartureAdminView[]>;
  saveDeparture(d: DepartureInput): Promise<Departure>;
  repeatDeparture(templateId: string, fromYmd: string, toYmd: string, weekdays: number[]): Promise<number>;
  cancelDeparture(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listBookings(q: { text?: string; fromIso?: string; toIso?: string; status?: BookingStatus }): Promise<BookingRow[]>;
  /** expectedAmount: the price shown/charged at the desk; the booking is refused (CONFLICT) if the live price differs. */
  deskBook(input: DeskBookInput): Promise<{ bookingId: string; token: string }>;
  cancelBooking(id: string): Promise<void>;
  moveBooking(id: string, toDepartureId: string): Promise<void>;
  resendEmails(id: string): Promise<void>;
  manifest(departureId: string): Promise<{ departure: DepartureAdminView; bookings: Booking[] }>;
  listStaff(): Promise<StaffUser[]>;
  inviteStaff(email: string, role: StaffRole, displayName: string): Promise<void>;
}

export type Api = PublicApi & StaffApi & { isDemo: boolean; setPassword?: (pw: string) => Promise<void> };
