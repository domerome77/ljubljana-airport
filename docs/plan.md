# LJU Airport Shuttle Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a seat-selling web app for Markun Borut d.o.o.'s vans (LJU → Ljubljana, LJU → Bled). It covers a public landing with Revolut checkout, a desk app, and an admin back office, at `https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24`.

**Architecture:**
- A static Vite + React + TS SPA (hash routing) runs on GitHub Pages.
- It talks to one `Api` interface with two implementations:
  - `MockApi`: in-browser demo mode, localStorage, used until credentials exist.
  - `SupabaseApi`: Postgres SQL functions under RLS, plus Edge Functions for Revolut, email and invoices.
- Pricing and availability are pure TS in `domain/` and mirrored 1:1 in SQL. A shared JSON vector file is asserted by both test suites.

**Tech Stack:**
- Frontend: Node 26 / npm, Vite 5, React 18, TypeScript 5, react-router-dom 6 (`HashRouter`), @supabase/supabase-js 2, qrcode, vitest, @testing-library/react, Playwright.
- Database tests: @electric-sql/pglite (real Postgres in WASM; Docker is not available on this machine).
- Edge Functions: Supabase (Deno) with `pdf-lib`, using the Resend HTTP API and the Revolut Merchant API.

**Spec:** `/Users/damijan/projects/goopti-storefront/docs/superpowers/specs/2026-11-25-lju-airport-shuttle-booking-design.md` (copied into the new repo as `docs/spec.md` in Task 1)

**Repo:** new `domerome77/ljubljana-airport`, local checkout `~/projects/ljubljana-airport`.

## Global Constraints

- **UI language:** all UI text in English.
- **Look:** Plus Jakarta Sans; colours pink `#ef3181` (hover `#d61f6c`), dark `#1f1f1f`, teal link `#0b6e75`, soft background `#f7eef3`, text `#16202e`, focus ring `#ffb547`.
- **URL:** public base path is `/ljubljana-airport/GoOpti-brnik-nov24/`. Routes:
  - `#/` and `#/booking/:id?t=TOKEN` (public)
  - `#/desk` (role desk|admin)
  - `#/admin/*` (role admin)
- **Time:** all times are stored as `timestamptz` and always displayed and entered in **Europe/Ljubljana**, never the device time zone.
- **Money:** EUR, two decimals, computed server-side. The client never sends an amount.
- **Vehicle data:** `vehicles.internal_name` is never returned by any public function, mock or real. The licence plate is public only in a paid booking's confirmation.
- **Seats left:** `seats_left = capacity − blocked_seats − Σ seats_taken(paid, or held with hold_expires_at > now)`.
- **Private product:** sellable only when `seats_left = capacity`; it takes all seats.
- **Sales window:** a departure is sellable (web and desk) while `now < departs_at − sales_close_minutes`. There is no upper horizon.
- **Defaults:**
  - sales close 10 min, hold 15 min
  - max 8 passengers per shared booking online
  - invoice VAT 9.5 % (prices include VAT)
  - invoice number `YYYY-NNNNNN`, credit note `D-YYYY-NNNNNN`
- **Invoice issuer:** Markun Borut d.o.o. (company fields come from settings). Payments go to GoOpti's Revolut.
- **Secrets:** Revolut secret, Revolut webhook secret and Resend key exist only as Supabase function secrets.
- **Demo mode:** active when `VITE_SUPABASE_URL` is empty. It shows a visible "DEMO" ribbon.

## Review Focus

1. **Last seat raced by web + desk** → exactly one hold succeeds. The other gets `SOLD_OUT` and the UI says "Those seats were just taken — please pick another departure" and refreshes the list. *(Task 2 vector, Task 9 SQL test)*
2. **Tourist's phone in another time zone** → times still show Ljubljana time, labelled "local time". *(Task 2 `formatLocal` test with TZ=America/New_York)*
3. **Return from Revolut before the webhook arrives** → the result page shows "Confirming your payment…" and polls every 3 s for up to 2 min. If the browser is closed, the emails are still sent by the webhook. *(Task 5 test, Task 11 webhook test)*
4. **Sales close passes, or a price changes, while the customer fills the form:**
   - the hold returns `SALES_CLOSED`, or
   - the hold returns a new amount, which the UI shows (`Price updated to X €`) before redirecting.
   *(Task 2 vectors, Task 5 test)*
5. **Admin edits below what is sold** (blocked seats, vehicle swap to a smaller van, cancelling a departure with paid bookings) → rejected with an explicit message. *(Task 3 mock tests, Task 9 SQL tests)*

---

## File Structure

```
ljubljana-airport/
  .github/workflows/pages.yml      build + deploy to Pages under /GoOpti-brnik-nov24/
  index.html                       root redirect → GoOpti-brnik-nov24/
  docs/spec.md, docs/plan.md, docs/SETUP.md (credentials hand-off)
  app/
    package.json, vite.config.ts, tsconfig.json, index.html
    public/assets/ (logo, hero-*.png, meeting-point-mock.svg)
    src/
      main.tsx, App.tsx (HashRouter, routes, DemoRibbon)
      config.ts                    reads VITE_* env; isDemo
      domain/
        types.ts                   all shared types
        pricing.ts                 quoteShared, quotePrivate, applyGroupDiscount
        availability.ts            seatsLeft, isSellable, privateAvailable
        time.ts                    formatLocal, toUtcFromLocal, dayLabel (Europe/Ljubljana)
        vectors.json               shared test vectors (also used by SQL tests)
      api/
        Api.ts                     PublicApi + StaffApi interfaces, ApiError
        mock/MockApi.ts, mock/seed.ts, mock/store.ts
        supabase/SupabaseApi.ts
        index.ts                   getApi(): Api (mock or supabase)
      ui/                          Button, Card, Field, Select, Toggle, SeatBar, Price, Modal
      public/
        Landing.tsx, SearchCard.tsx, DepartureList.tsx, CheckoutForm.tsx,
        BookingResult.tsx, Confirmation.tsx (also print), content.ts (How it works, FAQ copy)
      staff/
        Login.tsx, RequireRole.tsx
        desk/DeskPage.tsx
        admin/AdminLayout.tsx, TodayBoard.tsx, Vehicles.tsx, Departures.tsx,
              DepartureForm.tsx, RepeatDialog.tsx, Settings.tsx, Bookings.tsx,
              Manifest.tsx, Staff.tsx, exportCsv.ts
      styles/global.css, print.css
    tests/ (vitest unit/component) e2e/ (playwright)
  supabase/
    config.toml
    migrations/0001_schema.sql, 0002_functions.sql, 0003_rls.sql, 0004_cron.sql
    tests/ (vitest + pglite: schema, pricing parity, holds, staff ops)
    functions/
      deno.json                    import map: "pdf-lib": "npm:pdf-lib@1.17.1"
      _shared/revolut.ts, resend.ts, emails.ts, invoicePdf.ts, db.ts, cors.ts
      create-checkout/index.ts, revolut-webhook/index.ts, desk-book/index.ts,
      staff-actions/index.ts (cancel, move, resend, notify-vehicle-change)
```

---

### Task 1: Repo scaffold + Pages deploy pipeline

**Files:**
- Create: everything under `app/` (Vite React TS template trimmed)
- Create: `.github/workflows/pages.yml`, `index.html`, `docs/spec.md` (copy of the spec), `docs/plan.md` (copy of this plan), `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm run dev|build|test|e2e` in `app/`
- Produces: Vite `base: '/ljubljana-airport/GoOpti-brnik-nov24/'`

- [ ] **Step 1:** Create the local repo `~/projects/ljubljana-airport` and scaffold `app/` with `npm create vite@5 app -- --template react-ts`.
  - Add dependencies: `react-router-dom@6 @supabase/supabase-js@2 qrcode`.
  - Add dev dependencies: `vitest @testing-library/react @testing-library/user-event jsdom @playwright/test @electric-sql/pglite`.
- [ ] **Step 2:** Write the smoke test `tests/app.test.tsx`: render `<App/>`, expect the text `Airport transfers` to be present.
- [ ] **Step 3:** Run `cd app && npx vitest run`. Expected: FAIL.
- [ ] **Step 4:** Make `App.tsx` render a placeholder heading `Airport transfers` inside `HashRouter`. Run the test again. Expected: PASS.
- [ ] **Step 5:** Write the workflow `pages.yml`:
  - triggers: on push to `main`
  - build `app/` with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from repo **variables** (empty means demo)
  - copy `app/dist` to `_site/GoOpti-brnik-nov24/` and the root `index.html` to `_site/`
  - publish with `actions/upload-pages-artifact@3` + `actions/deploy-pages@4`
- [ ] **Step 6:** Create the GitHub repo (`gh repo create domerome77/ljubljana-airport --public --source . --push`).
  - Enable Pages with the source set to GitHub Actions: `gh api -X POST repos/domerome77/ljubljana-airport/pages -f build_type=workflow`.
  - Wait for the workflow.
  - Verify with `curl -sI https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/`. Expected: `200`.
- [ ] **Step 7:** Commit `chore: scaffold app and Pages deploy`.

### Task 2: Domain — types, pricing, availability, time

**Files:**
- Create: `app/src/domain/{types,pricing,availability,time}.ts`, `app/src/domain/vectors.json`
- Test: `app/tests/domain/{pricing,availability,time}.test.ts`

**Interfaces — Produces** (in `types.ts`):

```ts
type RouteCode = 'LJU-LJ' | 'LJU-BLED';
type Product = 'shared' | 'private';
type Channel = 'web' | 'desk';
type BookingStatus = 'held' | 'paid' | 'paid_overbooked' | 'cancelled' | 'expired';
type PaymentMethod = 'revolut' | 'desk_card' | 'desk_cash';
interface PriceTier { seatCount: number; pricePerSeat: number }           // ordered
interface GroupDiscount { minPassengers: number; percent: number }
interface Route { id: string; code: RouteCode; name: string; destinationLabel: string; active: boolean }
interface Vehicle { id: string; internalName: string; plate: string; seats: number; active: boolean; notes?: string }
interface Departure { id: string; routeId: string; vehicleId: string; departsAt: string /*ISO UTC*/; capacity: number;
  sellShared: boolean; sellPrivate: boolean; privatePrice: number | null; salesCloseMinutes: number;
  blockedSeats: number; blockedNote?: string; status: 'scheduled' | 'cancelled'; tiers: PriceTier[]; notes?: string }
interface Settings { defaultSeatPrice: Record<RouteCode, number>; defaultPrivatePrice: Record<RouteCode, number>;
  tierTemplate: PriceTier[]; minSeatPrice: number; maxSeatPrice: number; minPrivatePrice: number; maxPrivatePrice: number;
  groupDiscounts: GroupDiscount[]; defaultSalesCloseMinutes: number; holdMinutes: number; maxPassengersOnline: number;
  company: { name: string; address: string; vatId: string; regNo: string; iban: string; email: string; phone: string };
  vatRate: number; invoicePrefix: string; meetingPoint: { imageUrl: string; text: string }; supportPhone: string }
interface Buyer { name: string; email?: string; phone?: string; company?: { name: string; address: string; vatId: string } }
interface Booking { id: string; ref: string; token: string; departureId: string; product: Product; passengers: number;
  seatsTaken: number; amount: number; breakdown: QuoteLine[]; buyer: Buyer; channel: Channel; status: BookingStatus;
  holdExpiresAt: string | null; paymentMethod: PaymentMethod | null; paidAt: string | null; createdAt: string }
interface QuoteLine { label: string; amount: number }   // e.g. "2 × 12.00 €", "Group discount 5 %"
interface Quote { amount: number; lines: QuoteLine[]; seatsLeft: number }
interface PublicDeparture { id: string; routeCode: RouteCode; departsAt: string; seatsLeft: number; capacity: number;
  sharedFromPrice: number | null; privatePrice: number | null /* null if private unavailable */ }
```

**Interfaces — Produces** (functions):
- `quoteShared(tiers: PriceTier[], defaultPrice: number, alreadyTaken: number, passengers: number, discounts: GroupDiscount[]): Quote`
  - Seat *n* (1-based over `alreadyTaken+1 … alreadyTaken+passengers`) is priced by the tier whose cumulative range contains *n*; seats beyond all tiers use `defaultPrice`.
  - Lines are grouped per price.
  - Apply the **highest** `percent` where `passengers ≥ minPassengers`. Round the discount to 0.01 and present it as a negative line.
- `quotePrivate(price: number): Quote`
- `seatsLeft(capacity: number, blocked: number, takenActive: number): number`
- `isSellable(departsAtIso: string, salesCloseMinutes: number, nowIso: string): boolean`
- `privateAvailable(dep: Pick<Departure,'capacity'|'sellPrivate'>, seatsLeftNow: number): boolean`
- `formatLocal(iso: string, fmt: 'time'|'date'|'datetime'): string` (Europe/Ljubljana, en-GB, 24h)
- `toUtcFromLocal(dateYmd: string, timeHm: string): string`
- `dayLabel(iso: string, nowIso: string): 'Today'|'Tomorrow'|string`

- [ ] **Step 1:** Write `vectors.json`. It is an array of `{name, tiers, defaultPrice, alreadyTaken, passengers, discounts, expectedAmount}`. Include at least:
  - **tiers-cross:** tiers `[{3,12},{5,14},{10,16}]`, default 18, taken 2, pax 3, no discounts → **12 + 14 + 14 = 40.00**
  - **beyond-tiers:** same tiers, taken 17, pax 2 → **16 + 18 = 34.00**
  - **group-discount:** tiers `[{8,14}]`, pax 5, discounts `[{3,5},{5,10}]` → **70 − 7.00 = 63.00**
  - **no-tiers:** tiers `[]`, default 14, pax 1 → **14.00**
  - **rounding:** tiers `[{8,13.33}]`, pax 3, discount `[{3,5}]` → **39.99 − 2.00 = 37.99**
- [ ] **Step 2:** Write the tests:
  - `pricing.test.ts` iterates the vectors and asserts `quoteShared(...).amount === expectedAmount`. It also asserts the discount line label `Group discount 10 %`.
  - `availability.test.ts`:
    - `seatsLeft(8,2,3) === 3`
    - `isSellable('2026-11-25T10:00:00Z',10,'2026-11-25T09:49:59Z') === true`
    - `isSellable('2026-11-25T10:00:00Z',10,'2026-11-25T09:50:00Z') === false`
    - `privateAvailable({capacity:8,sellPrivate:true},7) === false`
  - `time.test.ts`, run with `process.env.TZ='America/New_York'`:
    - `formatLocal('2026-11-25T13:30:00Z','time') === '14:30'`
    - `toUtcFromLocal('2026-07-01','14:30') === '2026-07-01T12:30:00.000Z'` (summer DST)
    - `dayLabel('2026-11-25T22:30:00Z','2026-11-25T10:00:00Z') === 'Tomorrow'` (23:30 local)
- [ ] **Step 3:** Run `npx vitest run tests/domain`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement the four modules. Use `Intl.DateTimeFormat` with `timeZone:'Europe/Ljubljana'`. `toUtcFromLocal` resolves the offset by formatting a guess and correcting once.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit `feat(domain): pricing, availability, Ljubljana time`.

### Task 3: Api interface + MockApi (demo mode)

**Files:**
- Create: `app/src/api/Api.ts`, `app/src/api/mock/{MockApi,seed,store}.ts`, `app/src/api/index.ts`, `app/src/config.ts`
- Test: `app/tests/api/mockApi.test.ts`

**Interfaces — Consumes:** Task 2 types and functions.

**Interfaces — Produces** (`Api.ts`):

```ts
class ApiError extends Error { code: 'SOLD_OUT'|'SALES_CLOSED'|'INVALID'|'NOT_FOUND'|'FORBIDDEN'|'CONFLICT'|'NETWORK' }
interface HoldInput { departureId: string; product: Product; passengers: number; buyer: Buyer; channel: Channel }
interface HoldResult { bookingId: string; token: string; amount: number; lines: QuoteLine[]; holdExpiresAt: string }
interface PublicBookingView { ref: string; status: BookingStatus; routeCode: RouteCode; routeName: string; departsAt: string;
  product: Product; passengers: number; amount: number; plate: string | null /* only when paid */;
  meetingPoint: Settings['meetingPoint']; supportPhone: string; buyerName: string }
interface PublicApi {
  listDepartures(route: RouteCode): Promise<PublicDeparture[]>;        // sellable, seatsLeft>0, sorted asc
  quote(departureId: string, product: Product, passengers: number): Promise<Quote>;
  hold(input: HoldInput): Promise<HoldResult>;
  startCheckout(bookingId: string, token: string): Promise<{ checkoutUrl: string }>;
  getBooking(bookingId: string, token: string): Promise<PublicBookingView>;
}
interface StaffUser { id: string; email: string; role: 'admin'|'desk'; displayName: string }
interface DepartureAdminView extends Departure { routeCode: RouteCode; plate: string; vehicleName: string;
  soldSeats: number; heldSeats: number; seatsLeft: number; revenue: number; problems: string[] }
interface StaffApi {
  signIn(email: string, password: string): Promise<StaffUser>; signOut(): Promise<void>; me(): Promise<StaffUser | null>;
  listRoutes(): Promise<Route[]>;
  listVehicles(): Promise<Vehicle[]>; saveVehicle(v: Omit<Vehicle,'id'> & {id?: string}): Promise<Vehicle>;
  listDeparturesAdmin(fromIso: string, toIso: string): Promise<DepartureAdminView[]>;
  saveDeparture(d: Omit<Departure,'id'|'capacity'|'status'> & {id?: string}): Promise<Departure>; // capacity from vehicle on create; vehicle change → capacity = new seats, must be ≥ sold+held+blocked
  repeatDeparture(templateId: string, fromYmd: string, toYmd: string, weekdays: number[] /*1=Mon..7=Sun*/): Promise<number>;
  cancelDeparture(id: string): Promise<void>;                       // CONFLICT if paid bookings exist
  getSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
  listBookings(q: { text?: string; fromIso?: string; toIso?: string; status?: BookingStatus }): Promise<(Booking & {departsAt: string; routeCode: RouteCode; plate: string})[]>;
  deskBook(input: HoldInput & { paymentMethod: 'desk_card'|'desk_cash' }): Promise<{ bookingId: string; token: string }>;
  cancelBooking(id: string): Promise<void>;                          // paid → credit note
  moveBooking(id: string, toDepartureId: string): Promise<void>;
  resendEmails(id: string): Promise<void>;
  manifest(departureId: string): Promise<{ departure: DepartureAdminView; bookings: Booking[] }>;
  listStaff(): Promise<StaffUser[]>; inviteStaff(email: string, role: 'admin'|'desk', displayName: string): Promise<void>;
}
type Api = PublicApi & StaffApi;
// index.ts
function getApi(): Api
```

- [ ] **Step 1:** Write `mockApi.test.ts` against `new MockApi({ now: () => fixedNow, storage: memoryStorage })`:
  - `listDepartures('LJU-LJ')` contains no `internalName` or `plate` keys (`JSON.stringify` check), and is sorted ascending.
  - **Hold capacity:** a hold for 3 on an 8-seat van with `blockedSeats` 2 → the next `listDepartures` shows `seatsLeft` 3. A second hold for 4 rejects with `SOLD_OUT`.
  - **Hold expiry:** a hold expires after 15 min (advance the clock) → seats return.
  - **Private sale:** a private hold sets `seatsTaken = capacity`, after which the departure disappears from the list. After any shared hold, the departure's `privatePrice` is `null`.
  - **Sales close:** a hold 9 min before departure (close 10) → `SALES_CLOSED`.
  - **Admin edits below sold:** a `saveDeparture` raising `blockedSeats` above capacity − sold → `CONFLICT`. `cancelDeparture` with a paid booking → `CONFLICT`.
  - **Checkout and status:** `startCheckout` in the mock returns `#/booking/{id}?t={token}&demo=pay`. A demo `confirmPayment(id)` (mock-only method) sets the status to `paid`. `getBooking` then returns the plate.
  - **Desk:** `deskBook` returns a paid booking directly.
  - **Move booking:** moving to a full departure → `SOLD_OUT`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `MockApi`.
  - The state lives in `store.ts`: JSON in `localStorage` under the key `goopti-lju-demo-v1`, with an injectable storage and clock.
  - All rules call the Task 2 functions.
  - `seed.ts` creates:
    - routes `LJU-LJ` and `LJU-BLED`
    - vehicles `Kombi 1` LJ-AB-123 (8 seats), `Kombi 2` LJ-CD-456 (8), `Vito` LJ-EF-789 (6)
    - departures every 30–60 min from now+20 min until 22:00 today and tomorrow on both routes
    - default settings: LJ seat 14, Bled seat 25, private LJ 70, private Bled 120, tier template `[{3,12},{3,14}]`, discounts `[{3,5},{5,10}]`
    - demo staff `admin@demo` / `desk@demo`, password `demo`
  - Re-seeding happens when the store is empty. A "Reset demo data" action is available in admin.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): Api contract and demo MockApi`.

### Task 4: UI kit + landing page (search, departures, content)

**Files:**
- Create: `app/src/ui/*`, `app/src/public/{Landing,SearchCard,DepartureList,content}.ts(x)`, `app/src/styles/global.css`
- Create: `app/public/assets/*`, extracted from the attachment. The decoded PNGs are in the session scratchpad `unpack/`: logo `cb77091d…png`, heroes `867b4dac…`, `0134c143…`, `9180e2a9…`. Also create `meeting-point-mock.svg`, a simple terminal map with the "GoOpti vans P" marker.
- Test: `app/tests/public/landing.test.tsx`

**Interfaces — Consumes:** `PublicApi.listDepartures`, `quote`; `formatLocal`, `dayLabel`.

**Interfaces — Produces:** `<Landing api={PublicApi} now={() => string} />`; internal state `{ route, product, passengers, departureId }`.

- [ ] **Step 1:** Write the tests, with a fake `PublicApi`:
  - **Defaults:** the default route is LJ, the product is Shared, there is 1 passenger, and the **first (nearest) departure is preselected** with `aria-pressed=true`.
  - **Bled:** switching To = Bled calls `listDepartures('LJU-BLED')`.
  - **Private toggle:** Private hides departures whose `privatePrice` is `null` and shows `whole van · up to {capacity} people`.
  - **Passenger cap:** passengers above `seatsLeft` disable that departure ("Only 2 seats left").
  - **Price summary:** it shows the `quote` lines and total.
  - **Empty state:** the text `No vans on sale right now`.
  - **Grouping:** departures are grouped under `Today` / `Tomorrow` headers.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Port the template layout and styles:
  - header with logo, pink banner, hero split
  - the search card replaces the fixed-fare card:
    - From: static "Ljubljana Airport (LJU)"
    - To: select `Ljubljana — any address` / `Bled — any address`
    - Shared/Private: segmented toggle
    - Passengers: select 1–8
    - Departure: list grouped by day; each row shows `14:30 · in 25 min · 5 seats left · from 12 €`
  - trust strip: "Pay securely with Revolut", "Tell the driver your address", "No account needed"
  - How it works: Choose your van → Pay with Revolut → Find your van by its plate
  - FAQ (shared vs private, group discount, where to meet, what if I'm late, invoice)
  - footer
  - Banner copy: `Shared rides from {min} € per seat · private van from {min} €`, computed from the list.
  - Refresh the list every 30 s.
  - Mobile-first: the card stacks at < 720 px.
- [ ] **Step 4:** Run the tests. Expected: PASS. Also run `npm run dev`, check in the browser pane at 375 px and 1280 px, and take screenshots.
- [ ] **Step 5:** Commit `feat(public): landing with live departures search`.

### Task 5: Checkout form, booking result, confirmation (+print)

**Files:**
- Create: `app/src/public/{CheckoutForm,BookingResult,Confirmation}.tsx`, `app/src/styles/print.css`
- Test: `app/tests/public/checkout.test.tsx`, `app/tests/public/result.test.tsx`

**Interfaces — Consumes:** `hold`, `startCheckout`, `getBooking`, `ApiError`.

**Interfaces — Produces:**
- `<Confirmation booking={PublicBookingView} variant="screen"|"print" />`, reused by the desk in Task 7.
- `<Confirmation>` contents:
  - ref with a QR code of `ref` (`qrcode` → data URL)
  - route name, Ljubljana date and time (labelled "local time"), Shared/Private, passengers
  - **plate** in large monospace
  - amount paid
  - meeting-point image + text
  - "Tell your driver your destination address in {Ljubljana|Bled}"
  - support phone

- [ ] **Step 1:** Write the tests:
  - **Email required:** submitting without an email shows `Email is required` and does not call `hold`.
  - **Invalid email** is rejected the same way.
  - **Company section:** the "Invoice to a company" section is collapsed by default. When opened, it requires name, address and VAT ID.
  - **SOLD_OUT:** it shows `Those seats were just taken — please pick another departure` and calls `onRefresh`.
  - **Price change:** if the hold returns a different amount than the shown quote, the UI shows `Price updated to 40.00 €` and needs a second click before `startCheckout`.
  - **Happy path:** it assigns `window.location` to `checkoutUrl`.
  - **Polling:** `BookingResult` polls `getBooking` every 3 s while the status is `held`. It shows `Confirming your payment…`, then renders `<Confirmation>` when `paid`.
  - **Expired:** it shows `Payment not completed — your seats were released` with a "Back to departures" button.
  - **Demo:** in demo mode with `demo=pay`, it shows a fake "Revolut sandbox" panel with Pay / Fail buttons.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `print.css` hides everything but `.confirmation`.
  - Two print layouts are chosen with an `@page`/class toggle: A4, and 80 mm thermal (`.thermal` class, 72 mm content width).
- [ ] **Step 4:** Run the tests. Expected: PASS. Then click through the full demo flow in the browser pane.
- [ ] **Step 5:** Commit `feat(public): checkout, payment result and confirmation`.

### Task 6: Staff auth + admin back office

**Files:**
- Create: `app/src/staff/{Login,RequireRole}.tsx`
- Create: `app/src/staff/admin/*` (see File Structure)
- Test: `app/tests/staff/admin.test.tsx`

**Interfaces — Consumes:** all of `StaffApi`; `toUtcFromLocal`, `formatLocal`.

- [ ] **Step 1:** Write the tests, with `MockApi` and a memory store:
  - **Access control:** `#/admin` redirects to login when signed out; the desk role sees `Not allowed`.
  - **Vehicles:** add a vehicle → it appears in the list. Seats must be 1–60 and the plate is required.
  - **Departure form:**
    - add a departure for Bled 14:30 tomorrow → tiers are prefilled from `tierTemplate`; `salesCloseMinutes` is prefilled with 10
    - a price outside min/max shows `Price must be between 5 € and 60 €`
  - **Repeat:** Mon–Fri over 2 weeks creates 10.
  - **Blocked seats:** setting blocked seats 3 with note "GoOpti" → the Today board shows `sold 0 · blocked 3 · free 5`.
  - **Vehicle swap:** swapping to a 6-seat van when 7 are taken → the error `New vehicle has 6 seats but 7 are already taken`.
  - **Bookings:** cancelling a paid booking asks "This issues a credit note. Refund the money in Revolut Business." and sets the status `cancelled`.
  - **CSV export:** `exportCsv` produces the header `ref,channel,status,departure_local,route,product,passengers,amount,vat,net,payment_method,paid_at_local,buyer_name,buyer_email,company,invoice_number`.
  - **Settings:** save → reload → values persist.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the screens per spec §6.9. Use large controls: 48 px inputs and 16 px+ text.
  - The sidebar becomes a top tabs bar on mobile.
  - The Today board is the default `#/admin`. Problems (`paid_overbooked`, vehicle-changed-not-notified) appear on top in red.
  - The Manifest has a Print button.
  - The Staff screen lists and invites; in demo it only adds to the store.
- [ ] **Step 4:** Run the tests. Expected: PASS. Do a browser-pane walkthrough.
- [ ] **Step 5:** Commit `feat(admin): vehicles, departures, prices, bookings, manifest, export`.

### Task 7: Desk app

**Files:**
- Create: `app/src/staff/desk/DeskPage.tsx`
- Test: `app/tests/staff/desk.test.tsx`

**Interfaces — Consumes:** `SearchCard` and `DepartureList` (Task 4) in `variant="desk"`; `deskBook`; `getBooking`; `<Confirmation variant="print">`.

- [ ] **Step 1:** Write the tests:
  - **Required fields:** the desk form requires the passenger name; email is optional; payment method is card/cash (default card).
  - **Booking:** "Confirm & print" calls `deskBook`, then opens the print view containing the plate and calls `window.print`.
  - **Shared inventory:** after a desk booking of 3, the landing's `listDepartures` shows 3 fewer seats.
  - **Thermal toggle:** the toggle persists in `localStorage` (wrapped in try/catch).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The layout shows today's departures with seat bars on the left and the booking panel on the right; it stacks on tablet.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(desk): live desk booking with printed confirmation`.

### Task 8: Deploy demo + E2E smoke

**Files:**
- Create: `app/e2e/booking.spec.ts`, `app/playwright.config.ts`, `docs/SETUP.md` (skeleton)

- [ ] **Step 1:** Write the Playwright test against `vite preview`:
  - landing → Bled → 2 passengers → the first departure → details → Pay → demo Pay
  - the confirmation shows a plate matching `/^LJ-/`
  - `/#/admin` as `admin@demo` shows that booking
- [ ] **Step 2:** Run `npx playwright test`. Expected: PASS.
- [ ] **Step 3:** Push to `main` and wait for Pages. Verify the live URL in the browser pane: the demo ribbon is visible, the flow works, and there are no console errors.
- [ ] **Step 4:** Commit `test: e2e demo booking flow` and push.
- [ ] **Step 5 (checkpoint):** Tell the client the demo is live. Ask for:
  1. a Supabase project (URL + anon key + service-role access, or an invite to the org)
  2. a Resend account + sending domain
  3. Revolut Merchant sandbox keys
  4. Markun company data

### Task 9: Supabase schema, SQL functions, RLS (tested with PGlite)

**Files:**
- Create: `supabase/migrations/0001_schema.sql` … `0004_cron.sql`
- Test: `supabase/tests/{setup.ts,pricing.test.ts,holds.test.ts,staff.test.ts}`
  - `setup.ts` creates the stub `auth` schema: `auth.users(id uuid)`, plus `auth.uid()` reading `current_setting('test.uid')`.
  - It applies migrations 0001–0003. 0004 (pg_cron) is skipped in tests.

**Interfaces — Produces** (SQL, `public` schema):
- **Tables:** per spec §6.2, with snake_case names of the Task 2 types. Also `counters(year int, kind text, last int)`.
- **Public functions** (`security definer`, granted to `anon`):
  - `list_departures(p_route text) returns table(id uuid, route_code text, departs_at timestamptz, seats_left int, capacity int, shared_from_price numeric, private_price numeric)`
  - `quote(p_departure uuid, p_product text, p_passengers int) returns jsonb` → `{amount, lines, seats_left}`
  - `hold_seats(p_departure uuid, p_product text, p_passengers int, p_buyer jsonb, p_channel text) returns jsonb` → `{booking_id, token, amount, lines, hold_expires_at}`
    - Raises `SOLD_OUT` / `SALES_CLOSED` / `INVALID` as `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOLD_OUT'`.
    - The `web` channel is enforced for anon; `desk` requires a staff role.
  - `get_booking_public(p_id uuid, p_token text) returns jsonb` (the `PublicBookingView` shape, with the plate only if paid)
- **Internal functions** (service-role only):
  - `mark_paid(p_booking uuid, p_method text, p_revolut_order text) returns jsonb`
    - It re-checks capacity if the hold had expired and sets `paid` or `paid_overbooked`.
    - It issues the invoice number atomically and returns the booking + invoice.
    - It is idempotent: a second call returns the existing invoice.
  - `cancel_booking(p_booking uuid) returns jsonb` → `{credit_note}` when paid.
  - `move_booking(p_booking uuid, p_to uuid)`
  - `expire_holds()`
- **Staff functions** (`security invoker`, RLS by `staff.role`): `save_departure(jsonb)`, `repeat_departure(...)`, `cancel_departure(uuid)`, `admin_departures(from, to)`.

- [ ] **Step 1:** Write `pricing.test.ts`. It loads `app/src/domain/vectors.json`, creates a departure with each vector's tiers and pre-taken bookings, and asserts that `quote()` amount equals `expectedAmount`. This is the parity with the TS implementation.
- [ ] **Step 2:** Write `holds.test.ts`:
  - **Capacity:** blocked + held + paid respected. Expired holds are not counted.
  - **Private / shared exclusivity:** a private hold fills the van; private is null after a shared hold.
  - **Sales close:** `SALES_CLOSED` at the boundary.
  - **No internals leaked:** the anon role can't `select` from `bookings` or `vehicles` directly (`set role anon` → permission error), and `list_departures` output has no plate.
  - **Last seat:** two sequential holds for the last seat → the second gets `SOLD_OUT`.
  - **Payment confirmation:** `mark_paid` twice → one invoice; numbers are sequential `2026-000001`, `2026-000002`.
  - **Late payment:** `mark_paid` after expiry with seats taken → `paid_overbooked`; a 4th concurrent unexpired web hold for the same email → `INVALID` (abuse limit: max 3 active holds per email), and web `passengers > maxPassengersOnline` → `INVALID`.
- [ ] **Step 3:** Write `staff.test.ts`:
  - **Desk role limits:** desk can't update `settings` or `vehicles`.
  - **Vehicle swap:** a swap to a smaller van with sold seats raises `CONFLICT`.
  - **Cancel departure:** cancelling with paid bookings raises `CONFLICT`.
  - **Repeat:** creates the correct count in Ljubljana local time across the DST change (29 Mar 2026 → test 28–30 Mar at 14:30 local).
- [ ] **Step 4:** Run `cd supabase && npx vitest run`. Expected: FAIL.
- [ ] **Step 5:** Write the migrations.
  - `hold_seats` locks with `select … from departures where id = p_departure for update`.
  - The token is `encode(gen_random_bytes(18),'base64url')`-style (use `replace` on base64).
  - The ref is `'LJU-' || upper(substr(md5(random()::text),1,6))`, retried on collision.
  - `0004_cron.sql`: `select cron.schedule('expire-holds','* * * * *','select expire_holds()')`.
- [ ] **Step 6:** Run the tests. Expected: PASS.
- [ ] **Step 7:** Commit `feat(db): schema, booking functions, RLS`.

### Task 10: SupabaseApi adapter

**Files:**
- Create: `app/src/api/supabase/SupabaseApi.ts`
- Modify: `app/src/api/index.ts`
- Test: `app/tests/api/supabaseApi.test.ts`

**Interfaces — Consumes:** Task 9 SQL names; Edge Function names from Task 11 (`create-checkout`, `desk-book`, `staff-actions` with `{action:'cancel'|'move'|'resend'|'notify-vehicle-change'|'invite', …}`).

- [ ] **Step 1:** Write the tests, with a stubbed `supabase-js` client:
  - **Error mapping:** Postgres error message `SOLD_OUT` → `ApiError('SOLD_OUT')`.
  - **Field mapping:** snake_case rows map to camelCase types.
  - **Checkout:** `startCheckout` invokes `create-checkout` with `{bookingId, token}` and returns `checkoutUrl`.
  - **Staff sign-in:** `signIn` reads the `staff` row for the role. A user without a row gets `FORBIDDEN`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `getApi()` returns `SupabaseApi` when `config.supabaseUrl` is set.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): Supabase adapter`.

### Task 11: Edge Functions — Revolut, emails, invoice PDF

**Files:**
- Create: `supabase/functions/_shared/{revolut,resend,emails,invoicePdf,db,cors}.ts`
- Create: `supabase/functions/{create-checkout,revolut-webhook,desk-book,staff-actions}/index.ts`
- Create: `supabase/functions/deno.json`
- Test: `supabase/tests/functions/{revolut,emails,invoicePdf}.test.ts`
  - These run in vitest/node. The `_shared` modules must use only Web APIs, plus `pdf-lib` resolved through the import map in Deno and through npm in node.

**Interfaces — Produces:**
- `createRevolutOrder(cfg: {baseUrl, secretKey, apiVersion: '2024-09-01'}, o: {amountMinor: number, currency: 'EUR', description: string, email?: string, reference: string, redirectUrl: string}): Promise<{id: string, checkoutUrl: string}>`
  - `POST {baseUrl}/api/orders`, with headers `Authorization: Bearer`, `Revolut-Api-Version`.
  - `baseUrl` is `https://sandbox-merchant.revolut.com` or `https://merchant.revolut.com`, from the secret `REVOLUT_ENV`.
  - **Verify the body and response field names against current Revolut docs before coding.**
- `verifyRevolutSignature(rawBody: string, timestamp: string, signatureHeader: string, secret: string, nowMs: number): Promise<boolean>`
  - HMAC-SHA256 of `v1.{timestamp}.{rawBody}`; the header may contain several `v1=` values.
  - Reject if the timestamp is more than 5 min old.
  - **Confirm the scheme against the Revolut docs.**
- `renderConfirmationEmail(b: PublicBookingView & {ref: string}): {subject: string, html: string, text: string}`
  - Subject: `Your GoOpti transfer · {route} · {HH:MM} {Today|DD Mon} · {ref}`
  - Includes the plate, meeting-point image (absolute URL), and a QR image hosted via a data URL fallback to a text ref.
- `renderInvoiceEmail(inv: InvoiceDoc): {subject, html, text}`; `buildInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array>`
  - `InvoiceDoc = {kind:'invoice'|'credit_note', number, issuedAt, serviceDate, company, buyer, lines:{description, qty, unitGross, gross}[], vatRate, net, vat, gross, paymentMethod, refersTo?}`
  - net/vat are derived from gross: `net = round2(gross / (1 + vatRate))`, `vat = gross − net`.
- `sendEmail(apiKey, {from, to, subject, html, text, attachments?: {filename, content: base64}[]})` → Resend `POST https://api.resend.com/emails`
- `create-checkout`: verifies the booking is `held`, unexpired and the token matches → calls Revolut with `bookings.amount` → stores `revolut_order_id` → returns `{checkoutUrl}`.
- `revolut-webhook`:
  - verifies the signature
  - on `ORDER_COMPLETED`: `mark_paid` → sends the confirmation, then the invoice email (PDF attached) → writes `email_log`
  - always returns 200 after logging, so Revolut does not retry storms. It is idempotent via `mark_paid`.
- `desk-book`: needs a staff JWT → `hold_seats(channel 'desk')` → `mark_paid(desk_*)` → emails if an address is given → returns `{bookingId, token}`.
- `staff-actions`: needs an admin JWT for cancel / move / invite, desk or admin for resend. It sends the credit-note email on cancel, and an updated confirmation on a vehicle change or move.

- [ ] **Step 1:** Fetch the current Revolut Merchant API docs: create order, webhooks, signature. Record the confirmed field names and headers in `docs/SETUP.md`. If they differ from the interface above, update the interface before writing tests.
- [ ] **Step 2:** Write the tests:
  - **Signature:**
    - a known secret/body/timestamp vector → true
    - a tampered body → false
    - a stale timestamp → false
  - **Order creation:** `createRevolutOrder` (with stubbed `fetch`) sends `amount: 4000` for 40.00 € and the `Revolut-Api-Version` header.
  - **Emails:**
    - the confirmation email HTML contains the plate and ref, and does **not** contain the internal vehicle name
    - the invoice for 40.00 € at 9.5 % VAT has net 36.53 and VAT 3.47
  - **PDF:** the bytes start with `%PDF` and the text includes `Markun Borut d.o.o.`
  - **Credit note:** the title `Credit note` and negative amounts.
- [ ] **Step 3:** Run the tests. Expected: FAIL.
- [ ] **Step 4:** Implement the `_shared` modules and the four functions.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit `feat(functions): Revolut checkout + webhook, emails, invoices`.

### Task 12: Go live on Supabase + Revolut sandbox

*(Blocked until the client supplies credentials.)*

**Files:**
- Modify: `docs/SETUP.md` (final), `supabase/config.toml`

- [ ] **Step 1:** Link the Supabase CLI (`npx supabase@latest link`). Push the migrations and set the function secrets:
  - `REVOLUT_SECRET_KEY`, `REVOLUT_WEBHOOK_SECRET`, `REVOLUT_ENV=sandbox`
  - `RESEND_API_KEY`, `MAIL_FROM`
  - `PUBLIC_BASE_URL=https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/`
- [ ] **Step 2:** Deploy the functions. `revolut-webhook` uses `--no-verify-jwt`. Register the webhook URL in Revolut (sandbox) for `ORDER_COMPLETED`.
- [ ] **Step 3:** Create the first admin user and `staff` row. Seed the routes and settings with Markun's data.
- [ ] **Step 4:** Set the repo variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy Pages.
- [ ] **Step 5:** Run a live sandbox test:
  - web booking with a Revolut test card → the confirmation and invoice emails arrive
  - parallel race: two `hold_seats` RPCs for the last seat fired concurrently with a node script → exactly one succeeds
  - desk booking → print
  - cancel → credit note
- [ ] **Step 6:** Switch `REVOLUT_ENV=production` with the production key after the client approves the sandbox run.
- [ ] **Step 7:** Commit `docs: setup and go-live`.
