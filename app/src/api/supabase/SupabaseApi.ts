import { ApiError, type ApiErrorCode } from '../Api';
import type {
  Api, BookingRow, DepartureAdminView, DepartureInput, HoldInput, HoldResult, PublicBookingView, StaffUser, VehicleInput,
} from '../Api';
import type {
  Booking, BookingStatus, Departure, Product, PublicDeparture, Quote, Route, RouteCode, Settings, StaffRole, Vehicle,
} from '../../domain/types';

/** The subset of supabase-js we use (keeps the adapter testable with a stub). */
export interface SupabaseLike {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  functions: { invoke(name: string, opts: { body: unknown }): Promise<{ data: unknown; error: unknown }> };
  auth: {
    signInWithPassword(c: { email: string; password: string }): Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
    signOut(): Promise<{ error: unknown }>;
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
}

const CODES: ApiErrorCode[] = ['SOLD_OUT', 'SALES_CLOSED', 'INVALID', 'NOT_FOUND', 'FORBIDDEN', 'CONFLICT'];

interface PgError { message?: string; details?: string; context?: Response }

async function toApiError(e: unknown): Promise<ApiError> {
  const err = (e ?? {}) as PgError;
  // Edge function errors carry the response: { code, message }
  if (err.context && typeof err.context.json === 'function') {
    try {
      const body = (await err.context.json()) as { code?: string; message?: string };
      if (body.code && CODES.includes(body.code as ApiErrorCode)) return new ApiError(body.code as ApiErrorCode, body.message);
    } catch { /* fall through */ }
  }
  const msg = err.message ?? '';
  if (CODES.includes(msg as ApiErrorCode)) return new ApiError(msg as ApiErrorCode, err.details || msg);
  if (/permission denied|row-level security/i.test(msg)) return new ApiError('FORBIDDEN', 'Not allowed');
  if (/fetch|network/i.test(msg)) return new ApiError('NETWORK', 'Network problem — please try again');
  return new ApiError('INVALID', msg || 'Something went wrong');
}

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface StaffRow { user_id: string; email: string; role: StaffRole; display_name: string; active: boolean }
const toStaff = (r: StaffRow): StaffUser => ({ id: r.user_id, email: r.email, role: r.role, displayName: r.display_name || r.email });

interface VehicleRow { id: string; internal_name: string; plate: string; seats: number; active: boolean; notes: string | null }
const toVehicle = (r: VehicleRow): Vehicle => ({ id: r.id, internalName: r.internal_name, plate: r.plate, seats: r.seats, active: r.active, notes: r.notes ?? undefined });

function toBooking<T extends Booking>(b: T): T {
  return { ...b, amount: num(b.amount) };
}

function toDeparture<T extends Departure>(d: T): T {
  return { ...d, privatePrice: numOrNull(d.privatePrice), blockedNote: d.blockedNote ?? undefined, notes: d.notes ?? undefined };
}

export class SupabaseApi implements Api {
  readonly isDemo = false;
  constructor(private readonly sb: SupabaseLike) {}

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw await toApiError(error);
    return data as T;
  }

  private async invoke<T>(name: string, body: unknown): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(name, { body });
    if (error) throw await toApiError(error);
    return data as T;
  }

  private async table<T>(q: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    const { data, error } = await q;
    if (error) throw await toApiError(error);
    return data;
  }

  /** Emails are best-effort: a failed send must never undo a booking. */
  private notify(body: Record<string, unknown>) {
    this.invoke('staff-actions', body).catch(() => { /* surfaced in email_log */ });
  }

  // ---------- public ----------
  async listDepartures(route: RouteCode): Promise<PublicDeparture[]> {
    const rows = await this.call<Record<string, unknown>[]>('list_departures', { p_route: route });
    return (rows ?? []).map((r) => ({
      id: r.id as string, routeCode: r.route_code as RouteCode, departsAt: r.departs_at as string, seatsLeft: num(r.seats_left),
      capacity: num(r.capacity), sharedFromPrice: numOrNull(r.shared_from_price), privatePrice: numOrNull(r.private_price),
    }));
  }

  async quote(departureId: string, product: Product, passengers: number): Promise<Quote> {
    const q = await this.call<Quote>('quote', { p_departure: departureId, p_product: product, p_passengers: passengers });
    return { amount: num(q.amount), lines: q.lines.map((l) => ({ label: l.label, amount: num(l.amount) })), seatsLeft: num(q.seatsLeft) };
  }

  async hold(input: HoldInput): Promise<HoldResult> {
    const r = await this.call<{ booking_id: string; token: string; amount: number; lines: HoldResult['lines']; hold_expires_at: string }>('hold_seats', {
      p_departure: input.departureId, p_product: input.product, p_passengers: input.passengers, p_buyer: input.buyer, p_channel: input.channel,
    });
    return { bookingId: r.booking_id, token: r.token, amount: num(r.amount), lines: r.lines, holdExpiresAt: r.hold_expires_at };
  }

  async startCheckout(bookingId: string, token: string): Promise<{ checkoutUrl: string }> {
    return this.invoke<{ checkoutUrl: string }>('create-checkout', { bookingId, token });
  }

  async getBooking(bookingId: string, token: string): Promise<PublicBookingView> {
    const v = await this.call<PublicBookingView>('get_booking_public', { p_id: bookingId, p_token: token });
    return { ...v, amount: num(v.amount) };
  }

  // ---------- staff ----------
  private async staffRow(userId: string): Promise<StaffRow | null> {
    return this.table<StaffRow | null>(this.sb.from('staff').select('*').eq('user_id', userId).maybeSingle());
  }

  async signIn(email: string, password: string): Promise<StaffUser> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) throw new ApiError('FORBIDDEN', 'Wrong email or password');
    const row = await this.staffRow(data.user.id);
    if (!row || !row.active) {
      await this.sb.auth.signOut();
      throw new ApiError('FORBIDDEN', 'This account has no staff access');
    }
    return toStaff(row);
  }

  async signOut(): Promise<void> { await this.sb.auth.signOut(); }

  async me(): Promise<StaffUser | null> {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    const row = await this.staffRow(data.session.user.id);
    return row && row.active ? toStaff(row) : null;
  }

  async listRoutes(): Promise<Route[]> {
    const rows = await this.table<{ id: string; code: RouteCode; name: string; destination_label: string; active: boolean }[]>(
      this.sb.from('routes').select('*').order('id', { ascending: false }));
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, destinationLabel: r.destination_label, active: r.active }));
  }

  async listVehicles(): Promise<Vehicle[]> {
    return (await this.table<VehicleRow[]>(this.sb.from('vehicles').select('*').order('plate'))).map(toVehicle);
  }

  async saveVehicle(v: VehicleInput): Promise<Vehicle> {
    if (!v.plate?.trim()) throw new ApiError('INVALID', 'Licence plate is required');
    if (!Number.isInteger(v.seats) || v.seats < 1 || v.seats > 60) throw new ApiError('INVALID', 'Seats must be between 1 and 60');
    const row = { internal_name: v.internalName.trim(), plate: v.plate.trim().toUpperCase(), seats: v.seats, active: v.active, notes: v.notes || null };
    const q = v.id ? this.sb.from('vehicles').update(row).eq('id', v.id).select('*').single() : this.sb.from('vehicles').insert(row).select('*').single();
    return toVehicle(await this.table<VehicleRow>(q));
  }

  async listDeparturesAdmin(fromIso: string, toIso: string): Promise<DepartureAdminView[]> {
    const rows = await this.call<DepartureAdminView[]>('admin_departures', { p_from: fromIso, p_to: toIso });
    return (rows ?? []).map((d) => ({ ...toDeparture(d), revenue: num(d.revenue), soldSeats: num(d.soldSeats), heldSeats: num(d.heldSeats), seatsLeft: num(d.seatsLeft) }));
  }

  async saveDeparture(d: DepartureInput): Promise<Departure> {
    const r = await this.call<Departure & { vehicleChanged: boolean }>('save_departure', { p: d });
    if (r.vehicleChanged) this.notify({ action: 'notify-vehicle-change', departureId: r.id });
    return toDeparture(r);
  }

  async repeatDeparture(templateId: string, fromYmd: string, toYmd: string, weekdays: number[]): Promise<number> {
    return this.call<number>('repeat_departure', { p_template: templateId, p_from: fromYmd, p_to: toYmd, p_weekdays: weekdays });
  }

  async cancelDeparture(id: string): Promise<void> { await this.call('cancel_departure', { p_id: id }); }

  async getSettings(): Promise<Settings> {
    return (await this.table<{ data: Settings }>(this.sb.from('settings').select('data').eq('id', 1).single())).data;
  }

  async saveSettings(s: Settings): Promise<void> {
    await this.table(this.sb.from('settings').update({ data: s }).eq('id', 1));
  }

  async listBookings(q: { text?: string; fromIso?: string; toIso?: string; status?: BookingStatus }): Promise<BookingRow[]> {
    const rows = await this.call<BookingRow[]>('admin_bookings', { p_text: q.text ?? null, p_from: q.fromIso ?? null, p_to: q.toIso ?? null, p_status: q.status ?? null });
    return (rows ?? []).map(toBooking);
  }

  async deskBook(input: HoldInput & { paymentMethod: 'desk_card' | 'desk_cash' }): Promise<{ bookingId: string; token: string }> {
    const r = await this.call<{ booking: Booking }>('desk_book', {
      p_departure: input.departureId, p_product: input.product, p_passengers: input.passengers, p_buyer: input.buyer, p_method: input.paymentMethod,
    });
    if (input.buyer.email) this.notify({ action: 'send-booking-emails', bookingId: r.booking.id });
    return { bookingId: r.booking.id, token: r.booking.token };
  }

  async cancelBooking(id: string): Promise<void> {
    const r = await this.call<{ credit_note: unknown }>('cancel_booking', { p_booking: id });
    if (r.credit_note) this.notify({ action: 'send-credit-note', bookingId: id });
  }

  async moveBooking(id: string, toDepartureId: string): Promise<void> {
    await this.call('move_booking', { p_booking: id, p_to: toDepartureId });
    this.notify({ action: 'send-update', bookingId: id });
  }

  async resendEmails(id: string): Promise<void> {
    await this.invoke('staff-actions', { action: 'send-booking-emails', bookingId: id });
  }

  async manifest(departureId: string): Promise<{ departure: DepartureAdminView; bookings: Booking[] }> {
    const r = await this.call<{ departure: DepartureAdminView; bookings: Booking[] }>('manifest', { p_departure: departureId });
    return { departure: { ...toDeparture(r.departure), revenue: num(r.departure.revenue) }, bookings: r.bookings.map(toBooking) };
  }

  async listStaff(): Promise<StaffUser[]> {
    return (await this.table<StaffRow[]>(this.sb.from('staff').select('*').order('email'))).map(toStaff);
  }

  async inviteStaff(email: string, role: StaffRole, displayName: string): Promise<void> {
    await this.invoke('staff-actions', { action: 'invite', email, role, displayName });
  }
}
