import { ApiError } from '../Api';
import type {
  Api, BookingRow, DepartureAdminView, DepartureInput, HoldInput, HoldResult, PublicBookingView, StaffUser, VehicleInput,
} from '../Api';
import { isSellable, privateAvailable, seatsLeft } from '../../domain/availability';
import { quotePrivate, quoteShared, seatPrice } from '../../domain/pricing';
import { addDaysYmd, localHm, localYmd, toUtcFromLocal } from '../../domain/time';
import type {
  Booking, BookingStatus, Departure, Product, PublicDeparture, Quote, Route, RouteCode, Settings, StaffRole, Vehicle,
} from '../../domain/types';
import { bookingRef, bookingToken, uuid } from '../ids';
import { demoState, emptyState } from './seed';
import { load, save, SESSION_KEY, type DemoState, type StorageLike } from './store';

export { memoryStorage } from './store';

export interface MockApiOptions {
  now?: () => string;
  storage: StorageLike;
  seed?: 'demo' | 'empty';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTIVE: BookingStatus[] = ['paid', 'paid_overbooked'];

export class MockApi implements Api {
  readonly isDemo = true;
  private state: DemoState;
  private readonly now: () => string;
  private readonly storage: StorageLike;

  constructor(opts: MockApiOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.storage = opts.storage;
    const seed = opts.seed ?? 'demo';
    this.state = load(this.storage) ?? (seed === 'demo' ? demoState(this.now()) : emptyState());
    this.persist();
  }

  /** Demo only: wipe and re-seed. */
  resetDemo(): void {
    this.state = demoState(this.now());
    this.persist();
  }

  private persist() { save(this.storage, this.state); }

  // ---------- helpers ----------
  private dep(id: string): Departure {
    const d = this.state.departures.find((x) => x.id === id);
    if (!d) throw new ApiError('NOT_FOUND', 'Departure not found');
    return d;
  }
  private route(id: string): Route {
    return this.state.routes.find((r) => r.id === id)!;
  }
  private vehicle(id: string): Vehicle {
    const v = this.state.vehicles.find((x) => x.id === id);
    if (!v) throw new ApiError('NOT_FOUND', 'Vehicle not found');
    return v;
  }
  private isActive(b: Booking): boolean {
    if (ACTIVE.includes(b.status)) return true;
    return b.status === 'held' && !!b.holdExpiresAt && Date.parse(b.holdExpiresAt) > Date.parse(this.now());
  }
  private takenActive(depId: string, exceptBookingId?: string): number {
    return this.state.bookings
      .filter((b) => b.departureId === depId && b.id !== exceptBookingId && this.isActive(b))
      .reduce((s, b) => s + b.seatsTaken, 0);
  }
  private left(d: Departure, exceptBookingId?: string): number {
    return seatsLeft(d.capacity, d.blockedSeats, this.takenActive(d.id, exceptBookingId));
  }
  private privatePriceOf(d: Departure): number {
    return d.privatePrice ?? this.state.settings.defaultPrivatePrice[this.route(d.routeId).code];
  }
  private sharedDefault(d: Departure): number {
    return this.state.settings.defaultSeatPrice[this.route(d.routeId).code];
  }
  private computeQuote(d: Departure, product: Product, passengers: number): Quote {
    const left = this.left(d);
    const q = product === 'private'
      ? quotePrivate(this.privatePriceOf(d))
      : quoteShared(d.tiers, this.sharedDefault(d), this.takenActive(d.id), passengers, this.state.settings.groupDiscounts);
    return { ...q, seatsLeft: left };
  }
  private session(): StaffUser | null {
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StaffUser) : null;
    } catch {
      return null;
    }
  }
  private requireRole(...roles: StaffRole[]): StaffUser {
    const u = this.session();
    if (!u || !roles.includes(u.role)) throw new ApiError('FORBIDDEN', 'Not allowed');
    return u;
  }
  private nextNumber(kind: 'invoice' | 'credit_note', iso: string): string {
    const year = localYmd(iso).slice(0, 4);
    const key = `${kind}-${year}`;
    const n = (this.state.counters[key] ?? 0) + 1;
    this.state.counters[key] = n;
    const num = `${year}-${String(n).padStart(6, '0')}`;
    return kind === 'credit_note' ? `D-${num}` : `${this.state.settings.invoicePrefix}${num}`;
  }
  private logEmail(b: Booking, kind: 'confirmation' | 'invoice' | 'credit_note' | 'update') {
    if (b.buyer.email) this.state.emailLog.push({ bookingId: b.id, kind, to: b.buyer.email, at: this.now() });
  }
  private markPaid(b: Booking, method: Booking['paymentMethod']) {
    if (ACTIVE.includes(b.status)) return;
    const expired = b.status !== 'held' || (b.holdExpiresAt !== null && Date.parse(b.holdExpiresAt) <= Date.parse(this.now()));
    const d = this.dep(b.departureId);
    const fits = this.left(d, b.id) >= b.seatsTaken;
    b.status = expired && !fits ? 'paid_overbooked' : 'paid';
    b.paymentMethod = method;
    b.paidAt = this.now();
    b.holdExpiresAt = null;
    b.invoiceNumber = this.nextNumber('invoice', this.now());
    this.logEmail(b, 'confirmation');
    this.logEmail(b, 'invoice');
  }

  // ---------- public ----------
  async listDepartures(routeCode: RouteCode): Promise<PublicDeparture[]> {
    const route = this.state.routes.find((r) => r.code === routeCode);
    if (!route) return [];
    const now = this.now();
    return this.state.departures
      .filter((d) => d.routeId === route.id && d.status === 'scheduled' && isSellable(d.departsAt, d.salesCloseMinutes, now))
      .map((d): PublicDeparture => {
        const left = this.left(d);
        const taken = this.takenActive(d.id);
        return {
          id: d.id, routeCode, departsAt: d.departsAt, seatsLeft: left, capacity: d.capacity,
          sharedFromPrice: d.sellShared && left > 0 ? seatPrice(d.tiers, this.sharedDefault(d), taken + 1) : null,
          privatePrice: privateAvailable(d, left) ? this.privatePriceOf(d) : null,
        };
      })
      .filter((p) => p.seatsLeft > 0 && (p.sharedFromPrice !== null || p.privatePrice !== null))
      .sort((a, b) => a.departsAt.localeCompare(b.departsAt));
  }

  async quote(departureId: string, product: Product, passengers: number): Promise<Quote> {
    return this.computeQuote(this.dep(departureId), product, passengers);
  }

  async hold(input: HoldInput): Promise<HoldResult> {
    const b = this.createHold(input);
    this.persist();
    return { bookingId: b.id, token: b.token, amount: b.amount, lines: b.breakdown, holdExpiresAt: b.holdExpiresAt! };
  }

  private createHold(input: HoldInput): Booking {
    const { departureId, product, passengers, buyer, channel } = input;
    const s = this.state.settings;
    if (channel === 'desk') this.requireRole('desk', 'admin');
    if (!buyer.name?.trim()) throw new ApiError('INVALID', 'Name is required');
    if (channel === 'web' && !EMAIL_RE.test(buyer.email ?? '')) throw new ApiError('INVALID', 'Email is required');
    if (buyer.email && !EMAIL_RE.test(buyer.email)) throw new ApiError('INVALID', 'Email is invalid');
    if (!Number.isInteger(passengers) || passengers < 1) throw new ApiError('INVALID', 'Invalid number of passengers');
    if (channel === 'web' && product === 'shared' && passengers > s.maxPassengersOnline) {
      throw new ApiError('INVALID', `Online bookings are limited to ${s.maxPassengersOnline} passengers`);
    }
    const d = this.dep(departureId);
    if (d.status !== 'scheduled') throw new ApiError('SALES_CLOSED', 'This departure is cancelled');
    if (!isSellable(d.departsAt, d.salesCloseMinutes, this.now())) throw new ApiError('SALES_CLOSED', 'Sales for this departure have closed');
    if (product === 'shared' && !d.sellShared) throw new ApiError('INVALID', 'Shared seats are not sold on this departure');
    if (product === 'private' && passengers > d.capacity) throw new ApiError('INVALID', `This van takes up to ${d.capacity} people`);
    if (channel === 'web') {
      const activeHolds = this.state.bookings.filter(
        (b) => b.status === 'held' && this.isActive(b) && b.buyer.email?.toLowerCase() === buyer.email!.toLowerCase(),
      ).length;
      if (activeHolds >= 3) throw new ApiError('INVALID', 'Too many unfinished bookings — please complete or wait a few minutes');
    }
    const left = this.left(d);
    if (product === 'private' ? !privateAvailable(d, left) : passengers > left) {
      throw new ApiError('SOLD_OUT', 'Those seats were just taken');
    }
    const q = this.computeQuote(d, product, passengers);
    const b: Booking = {
      id: uuid(), ref: bookingRef(), token: bookingToken(), departureId, product, passengers,
      seatsTaken: product === 'private' ? d.capacity : passengers, amount: q.amount, breakdown: q.lines,
      buyer: { ...buyer, email: buyer.email?.trim() || undefined }, channel, status: 'held',
      holdExpiresAt: new Date(Date.parse(this.now()) + s.holdMinutes * 60_000).toISOString(),
      paymentMethod: null, paidAt: null, createdAt: this.now(), invoiceNumber: null, creditNoteNumber: null,
    };
    this.state.bookings.push(b);
    return b;
  }

  async startCheckout(bookingId: string, token: string): Promise<{ checkoutUrl: string }> {
    const b = this.findBooking(bookingId, token);
    if (!this.isActive(b) || b.status !== 'held') throw new ApiError('SALES_CLOSED', 'Your reservation expired');
    return { checkoutUrl: `#/booking/${b.id}?t=${b.token}&demo=pay` };
  }

  /** Demo stand-in for the Revolut webhook. */
  confirmPayment(bookingId: string): void {
    const b = this.state.bookings.find((x) => x.id === bookingId);
    if (!b) throw new ApiError('NOT_FOUND');
    this.markPaid(b, 'revolut');
    this.persist();
  }

  /** Demo stand-in for a failed/abandoned Revolut payment. */
  failPayment(bookingId: string): void {
    const b = this.state.bookings.find((x) => x.id === bookingId);
    if (b && b.status === 'held') b.status = 'expired';
    this.persist();
  }

  private findBooking(id: string, token: string): Booking {
    const b = this.state.bookings.find((x) => x.id === id && x.token === token);
    if (!b) throw new ApiError('NOT_FOUND', 'Booking not found');
    return b;
  }

  async getBooking(bookingId: string, token: string): Promise<PublicBookingView> {
    const b = this.findBooking(bookingId, token);
    if (b.status === 'held' && !this.isActive(b)) b.status = 'expired';
    const d = this.dep(b.departureId);
    const r = this.route(d.routeId);
    const paid = ACTIVE.includes(b.status);
    return {
      ref: b.ref, status: b.status, routeCode: r.code, routeName: r.name, destinationLabel: r.destinationLabel,
      departsAt: d.departsAt, product: b.product, passengers: b.passengers, amount: b.amount, lines: b.breakdown,
      plate: paid ? this.vehicle(d.vehicleId).plate : null, meetingPoint: this.state.settings.meetingPoint,
      supportPhone: this.state.settings.supportPhone, buyerName: b.buyer.name, holdExpiresAt: b.holdExpiresAt,
    };
  }

  // ---------- staff ----------
  async signIn(email: string, password: string): Promise<StaffUser> {
    const u = this.state.staff.find((s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.password === password);
    if (!u) throw new ApiError('FORBIDDEN', 'Wrong email or password');
    const { password: _pw, ...user } = u;
    void _pw;
    try { this.storage.setItem(SESSION_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    return user;
  }
  async signOut(): Promise<void> {
    try { this.storage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
  async me(): Promise<StaffUser | null> { return this.session(); }

  async listRoutes(): Promise<Route[]> { return this.state.routes.map((r) => ({ ...r })); }

  async listVehicles(): Promise<Vehicle[]> {
    this.requireRole('admin');
    return this.state.vehicles.map((v) => ({ ...v }));
  }

  async saveVehicle(v: VehicleInput): Promise<Vehicle> {
    this.requireRole('admin');
    if (!v.plate?.trim()) throw new ApiError('INVALID', 'Licence plate is required');
    if (!Number.isInteger(v.seats) || v.seats < 1 || v.seats > 60) throw new ApiError('INVALID', 'Seats must be between 1 and 60');
    const clean: Vehicle = { ...v, id: v.id ?? uuid(), plate: v.plate.trim().toUpperCase(), internalName: v.internalName.trim() };
    const i = this.state.vehicles.findIndex((x) => x.id === clean.id);
    if (i >= 0) this.state.vehicles[i] = clean; else this.state.vehicles.push(clean);
    this.persist();
    return { ...clean };
  }

  private adminView(d: Departure): DepartureAdminView {
    const bookings = this.state.bookings.filter((b) => b.departureId === d.id);
    const paid = bookings.filter((b) => ACTIVE.includes(b.status));
    const held = bookings.filter((b) => b.status === 'held' && this.isActive(b));
    const v = this.vehicle(d.vehicleId);
    const problems: string[] = [];
    if (bookings.some((b) => b.status === 'paid_overbooked')) problems.push('Overbooked — a payment arrived after the hold expired');
    return {
      ...d, routeCode: this.route(d.routeId).code, plate: v.plate, vehicleName: v.internalName,
      soldSeats: paid.reduce((s, b) => s + b.seatsTaken, 0), heldSeats: held.reduce((s, b) => s + b.seatsTaken, 0),
      seatsLeft: this.left(d), revenue: paid.reduce((s, b) => s + b.amount, 0), problems,
    };
  }

  async listDeparturesAdmin(fromIso: string, toIso: string): Promise<DepartureAdminView[]> {
    this.requireRole('admin', 'desk');
    return this.state.departures
      .filter((d) => d.departsAt >= fromIso && d.departsAt < toIso)
      .sort((a, b) => a.departsAt.localeCompare(b.departsAt))
      .map((d) => this.adminView(d));
  }

  private validatePrices(d: DepartureInput) {
    const s = this.state.settings;
    for (const t of d.tiers) {
      if (!(t.seatCount >= 1)) throw new ApiError('INVALID', 'Each price tier needs at least 1 seat');
      if (t.pricePerSeat < s.minSeatPrice || t.pricePerSeat > s.maxSeatPrice) {
        throw new ApiError('INVALID', `Price must be between ${s.minSeatPrice} € and ${s.maxSeatPrice} €`);
      }
    }
    if (d.privatePrice !== null && (d.privatePrice < s.minPrivatePrice || d.privatePrice > s.maxPrivatePrice)) {
      throw new ApiError('INVALID', `Private price must be between ${s.minPrivatePrice} € and ${s.maxPrivatePrice} €`);
    }
  }

  async saveDeparture(input: DepartureInput): Promise<Departure> {
    this.requireRole('admin');
    this.validatePrices(input);
    if (!this.state.routes.some((r) => r.id === input.routeId)) throw new ApiError('INVALID', 'Choose a route');
    const v = this.vehicle(input.vehicleId);
    if (!(input.salesCloseMinutes >= 0)) throw new ApiError('INVALID', 'Sales close must be 0 minutes or more');
    if (!(input.blockedSeats >= 0)) throw new ApiError('INVALID', 'Blocked seats cannot be negative');
    const existing = input.id ? this.dep(input.id) : null;
    const capacity = v.seats;
    const taken = existing ? this.takenActive(existing.id) : 0;
    if (existing && existing.vehicleId !== v.id && capacity < taken + input.blockedSeats) {
      throw new ApiError('CONFLICT', `New vehicle has ${capacity} seats but ${taken + input.blockedSeats} are already taken`);
    }
    if (input.blockedSeats > capacity - taken) {
      throw new ApiError('CONFLICT', `Only ${capacity - taken} seats can be blocked (${taken} already taken)`);
    }
    const d: Departure = {
      ...input, id: existing?.id ?? uuid(), capacity, status: existing?.status ?? 'scheduled',
      tiers: input.tiers.map((t) => ({ ...t })),
    };
    if (existing) {
      const vehicleChanged = existing.vehicleId !== d.vehicleId;
      Object.assign(existing, d);
      if (vehicleChanged) {
        for (const b of this.state.bookings.filter((x) => x.departureId === d.id && ACTIVE.includes(x.status))) this.logEmail(b, 'update');
      }
    } else {
      this.state.departures.push(d);
    }
    this.persist();
    return { ...d };
  }

  async repeatDeparture(templateId: string, fromYmd: string, toYmd: string, weekdays: number[]): Promise<number> {
    this.requireRole('admin');
    const t = this.dep(templateId);
    const hm = localHm(t.departsAt);
    let n = 0;
    for (let day = fromYmd; day <= toYmd; day = addDaysYmd(day, 1)) {
      const wd = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
      if (!weekdays.includes(wd)) continue;
      const departsAt = toUtcFromLocal(day, hm);
      if (departsAt === t.departsAt) continue;
      this.state.departures.push({ ...t, id: uuid(), departsAt, blockedSeats: 0, blockedNote: undefined, status: 'scheduled', tiers: t.tiers.map((x) => ({ ...x })) });
      n++;
    }
    this.persist();
    return n;
  }

  async cancelDeparture(id: string): Promise<void> {
    this.requireRole('admin');
    const d = this.dep(id);
    if (this.state.bookings.some((b) => b.departureId === id && ACTIVE.includes(b.status))) {
      throw new ApiError('CONFLICT', 'This departure has paid bookings — move or cancel them first');
    }
    d.status = 'cancelled';
    this.persist();
  }

  async getSettings(): Promise<Settings> {
    this.requireRole('admin', 'desk');
    return structuredClone(this.state.settings);
  }

  async saveSettings(s: Settings): Promise<void> {
    this.requireRole('admin');
    this.state.settings = structuredClone(s);
    this.persist();
  }

  async listBookings(q: { text?: string; fromIso?: string; toIso?: string; status?: BookingStatus }): Promise<BookingRow[]> {
    this.requireRole('admin', 'desk');
    const text = q.text?.trim().toLowerCase();
    return this.state.bookings
      .map((b): BookingRow => {
        if (b.status === 'held' && !this.isActive(b)) b.status = 'expired';
        const d = this.dep(b.departureId);
        return { ...b, departsAt: d.departsAt, routeCode: this.route(d.routeId).code, plate: this.vehicle(d.vehicleId).plate };
      })
      .filter((b) => !text || [b.ref, b.buyer.name, b.buyer.email ?? '', b.buyer.company?.name ?? ''].some((f) => f.toLowerCase().includes(text)))
      .filter((b) => (!q.fromIso || b.departsAt >= q.fromIso) && (!q.toIso || b.departsAt < q.toIso))
      .filter((b) => !q.status || b.status === q.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deskBook(input: HoldInput & { paymentMethod: 'desk_card' | 'desk_cash' }): Promise<{ bookingId: string; token: string }> {
    this.requireRole('desk', 'admin');
    const b = this.createHold({ ...input, channel: 'desk' });
    this.markPaid(b, input.paymentMethod);
    this.persist();
    return { bookingId: b.id, token: b.token };
  }

  async cancelBooking(id: string): Promise<void> {
    this.requireRole('admin');
    const b = this.state.bookings.find((x) => x.id === id);
    if (!b) throw new ApiError('NOT_FOUND');
    if (ACTIVE.includes(b.status)) {
      b.creditNoteNumber = this.nextNumber('credit_note', this.now());
      this.logEmail(b, 'credit_note');
    }
    b.status = 'cancelled';
    b.holdExpiresAt = null;
    this.persist();
  }

  async moveBooking(id: string, toDepartureId: string): Promise<void> {
    this.requireRole('admin');
    const b = this.state.bookings.find((x) => x.id === id);
    if (!b) throw new ApiError('NOT_FOUND');
    const from = this.dep(b.departureId);
    const to = this.dep(toDepartureId);
    if (to.routeId !== from.routeId) throw new ApiError('INVALID', 'You can only move a booking to the same route');
    const left = this.left(to);
    const fits = b.product === 'private' ? left === to.capacity : left >= b.seatsTaken;
    if (!fits) throw new ApiError('SOLD_OUT', 'Not enough free seats on that departure');
    b.departureId = to.id;
    if (b.product === 'private') b.seatsTaken = to.capacity;
    if (b.status === 'paid_overbooked') b.status = 'paid';
    this.logEmail(b, 'update');
    this.persist();
  }

  async resendEmails(id: string): Promise<void> {
    this.requireRole('admin', 'desk');
    const b = this.state.bookings.find((x) => x.id === id);
    if (!b) throw new ApiError('NOT_FOUND');
    this.logEmail(b, 'confirmation');
    this.logEmail(b, 'invoice');
    this.persist();
  }

  async manifest(departureId: string): Promise<{ departure: DepartureAdminView; bookings: Booking[] }> {
    this.requireRole('admin', 'desk');
    const d = this.dep(departureId);
    return {
      departure: this.adminView(d),
      bookings: this.state.bookings.filter((b) => b.departureId === d.id && ACTIVE.includes(b.status)).map((b) => ({ ...b })),
    };
  }

  async listStaff(): Promise<StaffUser[]> {
    this.requireRole('admin');
    return this.state.staff.map(({ password: _p, ...u }) => { void _p; return u; });
  }

  async inviteStaff(email: string, role: StaffRole, displayName: string): Promise<void> {
    this.requireRole('admin');
    if (!EMAIL_RE.test(email)) throw new ApiError('INVALID', 'Email is invalid');
    if (this.state.staff.some((s) => s.email.toLowerCase() === email.toLowerCase())) throw new ApiError('CONFLICT', 'This user already exists');
    this.state.staff.push({ id: uuid(), email, role, displayName: displayName || email, password: 'demo' });
    this.persist();
  }
}
