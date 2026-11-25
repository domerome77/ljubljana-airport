# LJU Airport Shuttle — booking app (GoOpti × Markun Borut d.o.o.)

Status: draft for approval · 2026-11-25
Deploy target: `https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24`
UI language: English. Design baseline: `~/Desktop/GoOpti Airport Shuttle markun brnik letalisce ljubljana qr code landing.html` (Claude Design bundle, React, Plus Jakarta Sans, GoOpti pink `#ef3181` / dark `#1f1f1f`).

## 1. Intent

Markun Borut d.o.o. runs vans from Ljubljana Airport (LJU). They want a simple, robust way to sell seats on those vans under the GoOpti brand:
online on a landing page (passengers scan a QR code at the airport or find it beforehand), and live at an airport desk.
Staff must be able to put their own vans on sale with their own departure times and prices, without developers.

Success = a passenger at LJU can, in under a minute and without an account, see the next van to Ljubljana or Bled, how many seats are left,
pay the exact price via Revolut, and receive a confirmation telling them which van (licence plate) to board and where it is parked.
The desk agent sells from exactly the same seat inventory, so a van is never overbooked.

## 2. Goals

- Routes: **LJU → Ljubljana (any address)** and **LJU → Bled (any address)**. Passengers do not enter the address; they tell the driver.
- Two products per departure: **Shared** (priced per seat) and **Private** (whole vehicle, one price, occupies all seats even for 1 passenger).
- Landing search: **From** (fixed: Ljubljana Airport) · **To** (Ljubljana / Bled) · **Shared / Private** · **Departure time** (nearest first, then later ones, each with seats left) · **Passengers**.
- Live seat counts; each sale (web or desk) decrements availability; full departures disappear from sale.
- Admin back office: vehicles, departures, prices, settings, bookings, passenger manifest per departure.
- Desk role: books on behalf of a passenger at the airport, same inventory, prints the confirmation on paper.
- Revolut payment with the server-computed price (cannot be tampered with in the browser).
- Two emails after successful payment: (1) booking confirmation, (2) invoice from **Markun Borut d.o.o.**
- No passenger registration; email is the only mandatory contact field online.

## 3. Non-goals (this phase)

- Fiscal verification of invoices at FURS (ZOI/EOR) — explicitly deferred by the client; invoices are designed so it can be added later.
- City → Airport direction (in Markun's notes, not in this request). The data model supports any route, so it is a config change later.
- Driver mobile app; any integration with the GoOpti system. These vans are planned independently of GoOpti. Until an integration is decided, the admin manually
  checks how many seats GoOpti sold for a given van/day and **blocks** that many seats on the departure (§6.2 `blocked_seats`), so fewer are offered here.
- Refunds through the Revolut API (admin can cancel a booking and release seats; money is refunded manually in Revolut Business).
- Multi-language UI.

## 4. Anti-goals

- Overbooking a van — two buyers (web/web or web/desk) must never get the same last seat.
- A price shown on the page that differs from what Revolut charges.
- A back office that needs a manual to use. "Bulky and easy": large controls, few screens, sensible defaults.
- Secrets (Revolut key, email key) in the repository or in the browser.
- Showing the internal vehicle name to passengers.

## 5. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Static frontend on GitHub Pages + **Supabase** (Postgres, Auth, RLS, Edge Functions) + **Resend** for email + **Revolut Merchant API** | Keeps the requested github.io URL; free tier fits; atomic seat locking in Postgres; built-in auth/roles. Two external services. |
| B | GitHub Pages + Cloudflare Workers + D1 | Same shape, but auth, roles and admin data access must be hand-built — more code and risk for the same result. |
| C | Build into the GoOpti Rails storefront | Best long-term coupling with the GoOpti plan, but slow, needs GoOpti infra deploy, not on github.io. Candidate for a later phase. |

Client picked **A**.

## 6. Design

### 6.1 Architecture

```
GitHub Pages (static, Vite + React + TS build)
  /GoOpti-brnik-nov24/#/            landing + booking (public)
  /GoOpti-brnik-nov24/#/booking/:id  result page after Revolut redirect (polls status)
  /GoOpti-brnik-nov24/#/desk         desk app (login, role desk|admin)
  /GoOpti-brnik-nov24/#/admin        back office (login, role admin)
        │  supabase-js (anon key = public, safe; RLS enforces access)
        ▼
Supabase
  Postgres: tables + RLS + SQL functions (pricing, holds, booking)
  Auth: email+password for staff only; role in staff table
  Edge Functions (secrets live here):
    create-checkout   → validates hold, creates Revolut order with DB-computed amount, returns checkout_url
    revolut-webhook   → verifies signature, marks booking PAID, issues invoice number, sends 2 emails
    desk-book         → desk/admin: books + marks paid (desk payment), sends emails if email given
    cancel-booking    → admin: cancel + release seats
  pg_cron (every minute): expire unpaid holds
        │
        ├─► Revolut Merchant API (sandbox first, then production)
        └─► Resend (transactional email)
```

Hash routing is used so GitHub Pages needs no SPA rewrite rules.

### 6.2 Data model (Postgres)

- `routes(id, code, name, origin_label, destination_label, active)` — seeded: `LJU-LJ` "Ljubljana Airport → Ljubljana (any address)", `LJU-BLED` "Ljubljana Airport → Bled (any address)".
- `vehicles(id, internal_name, plate, seats, active, notes)` — reusable; `internal_name` never sent to public endpoints.
- `departures(id, route_id, vehicle_id, departs_at timestamptz, sell_shared bool, sell_private bool, private_price numeric null, sales_close_minutes int, blocked_seats int default 0, blocked_note text, status: scheduled|cancelled, notes)`
  - `sales_close_minutes`: how many minutes before departure this van stops selling (prefilled from settings, e.g. 5 or 10; applies to web and desk).
  - `blocked_seats`: seats taken outside this app (e.g. sold via GoOpti), entered manually by admin; they reduce seats on sale.
  - Capacity = `vehicles.seats` at time of creation, snapshotted into `departures.capacity` so later vehicle edits don't change sold departures.
- `price_tiers(id, departure_id, position, seat_count, price_per_seat)` — ordered fill-based buckets ("first 3 seats at 12 €, next 5 at 14 €, next 10 at 16 €").
  Seats beyond the defined tiers use the route default price. Prefilled from a **tier template** (settings) when a departure is created; admin can edit per departure.
- `settings` (single row / key-value):
  - default seat price per route, default private (whole van) price per route
  - default tier template
  - min/max allowed seat price and min/max private price (admin input is validated against these)
  - group discount rules: list of `{min_passengers, percent}` (e.g. 3+ → 5 %, 5+ → 10 %); applied to the shared total
  - default sales close (minutes before departure; default **10**, editable per departure), hold duration (default 15 min)
  - company/invoice data: Markun Borut d.o.o., address, VAT ID, registration no., IBAN, VAT rate (assumption: 9.5 % passenger transport — **to confirm with the accountant**), invoice number prefix
  - meeting-point image URL + text (mockup until client supplies the real photo)
- Admin can edit `blocked_seats` at any time (cannot exceed capacity − sold); Today board shows sold / blocked / free.
- `bookings(id, ref (short code e.g. LJU-7K3F9Q), departure_id, product: shared|private, passengers int, seats_taken int, amount numeric, currency EUR, price_breakdown jsonb, customer_name, customer_email, customer_phone, channel: web|desk, status: held|paid|cancelled|expired, hold_expires_at, payment_method: revolut|desk_card|desk_cash, revolut_order_id, paid_at, created_by (staff id, desk), created_at)`
  - Private booking: `seats_taken = capacity`.
- `invoices(id, booking_id, kind: invoice|credit_note, number (sequential per year and kind, e.g. 2026-000123 / D-2026-000004), refers_to_invoice_id, issued_at, buyer jsonb (name, email, optional company name/address/VAT ID), lines jsonb, net, vat, gross, sent_at)` — numbering via a per-year counter row locked in the same transaction.
- `staff(user_id → auth.users, role: admin|desk, display_name, active)`
- `email_log(id, booking_id, kind: confirmation|invoice, provider_id, status, error, created_at)`

### 6.3 Availability and pricing (single source of truth in SQL)

- `seats_left(departure) = capacity − blocked_seats − Σ seats_taken of bookings with status paid, or held and hold_expires_at > now()`.
- Private is offered only while `seats_left = capacity` (no seat sold or blocked yet). A shared sale removes the Private option for that departure; a Private sale makes it full.
- `quote(departure_id, product, passengers)` SQL function returns `{amount, breakdown, seats_left}`:
  - Shared: seat number *n* (1-based, counting already-taken seats) is priced by the tier whose cumulative range contains *n*; sum over the requested seats; then apply the best matching group discount; round to 0.01 €.
  - Private: `departure.private_price` or route default.
- The UI shows the quote before payment; the Edge Function charges `bookings.amount` written by `hold_seats` — never a client value.

### 6.4 Concurrency and holds

`hold_seats(departure_id, product, passengers, customer…)` runs in one transaction: `SELECT … FROM departures WHERE id = $1 FOR UPDATE`, recompute `seats_left`, reject if insufficient or outside the sales window, compute the quote, insert booking `held` with `hold_expires_at = now() + hold duration`. Web and desk both call it, so they fill the same seats.
Expired holds stop counting immediately (the `hold_expires_at > now()` predicate); pg_cron flips them to `expired` for tidiness.
If a Revolut payment completes after the hold expired (rare), the webhook re-checks capacity: if seats are still free it confirms; otherwise it marks the booking `paid_overbooked`, emails admin, and the admin resolves (refund or add vehicle). Admin dashboard highlights these.

Public listing = departures where `status = scheduled`, `seats_left > 0`, `now() < departs_at − sales_close_minutes`. No upper horizon: future departures are sellable as soon as admin creates them. Exposed through a SQL view/function returning route, time, seats left, products and prices — no vehicle name, no plate.

### 6.5 Passenger flow (web)

1. **Search card** (replaces the fixed-fare card in the template; same visual style): To (Ljubljana — any address / Bled — any address), Shared | Private toggle, Passengers (1–8; private: up to vehicle seats), Departure time.
2. **Departure list** (grouped by day — Today / Tomorrow / date — with a date picker when departures span several days): nearest sellable departure pre-selected and highlighted, other options below: `14:30 · in 25 min · 5 seats left · from 14 €` (Private: `whole van · up to 8 people · 90 €`). Full departures are not listed. Empty state: "No vans on sale right now — ask at the GoOpti desk in arrivals" + desk location.
3. **Price summary** live from `quote` (with discount line if applied).
4. **Details**: full name, email (required), phone (optional), checkbox accept terms. Button "Pay 42 € with Revolut".
5. `hold_seats` → `create-checkout` → redirect to Revolut hosted checkout (`checkout_url`); redirect back to `#/booking/:id?token=…`.
6. Result page polls booking status (webhook is the source of truth, not the redirect): Paid → on-screen confirmation (same content as the email) with "Add to wallet"-style big card; Failed/expired → "Payment not completed, seats released, try again".
Seat counts on the landing refresh every 30 s and immediately before holding.

Content kept from the template: header, hero images, "How it works" (rewritten: Choose your van → Pay with Revolut → Find your van by its plate), FAQ (rewritten for shared/private, discounts, where to meet), footer. The fixed "14 €" messaging is replaced by "from X €" computed from live prices.

### 6.6 Confirmation email (and printout)

Subject: "Your GoOpti transfer · LJU → Ljubljana · 14:30 today · LJU-7K3F9Q".
Content: booking ref + QR code of the ref (for the driver to check), route, date & departure time, Shared/Private, passengers, **vehicle licence plate**, amount paid, meeting-point image (mockup now) with short directions, "tell your driver your destination address", contact phone. No vehicle name.
The desk printout is the same template rendered with a print stylesheet (A4 and 80 mm thermal-friendly layout).

### 6.7 Invoice email

Separate email sent after the confirmation: HTML invoice + attached PDF (generated in the Edge Function).
Issuer: Markun Borut d.o.o. (full company data from settings); invoice number, issue date, service date, buyer (name, email), line(s) e.g. "Airport transfer LJU → Ljubljana, 14:30 26 Nov 2026, shared, 3 seats", net / VAT / gross, payment method "Card via Revolut — paid". Placeholders reserved for ZOI/EOR fields for later fiscalization.

### 6.8 Desk app (`#/desk`)

Staff login. Same search & departure list as the landing (same sales-close rule, larger touch targets), plus passenger name, optional email, payment method (card terminal / cash).
"Confirm & print" → `desk-book` (hold + mark paid in one call) → print dialog with the confirmation; if an email is given, both emails are sent too; otherwise the invoice is printed after the confirmation.
Desk sees today's departures with a live seat bar and can open a departure's manifest.

### 6.9 Admin back office (`#/admin`)

- **Today board** (home): departures as cards — time, route, plate, seats sold/capacity bar, revenue; problems (overbooked, expired-paid) on top.
- **Vehicles**: list + add/edit (internal name, plate, seats, active).
- **Departures**: list by day; "Add departure" (route, vehicle, date, time, shared/private, prices prefilled from settings, editable tiers); **"Repeat"** — create the same departure for a date range on selected weekdays (standard timetable practice); edit/cancel (cancel only if no paid bookings, otherwise warns).
- **Prices & settings**: defaults per route, tier template, min/max bounds, group discounts, default sales close (minutes before departure), hold duration, company/invoice data, meeting-point image & text.
- **Bookings**: search by ref/email/name/date; status; resend emails; cancel (releases seats).
- **Manifest** per departure: printable passenger list for the driver.
- **Staff**: invite users and assign admin/desk role.

### 6.10 Security

- RLS on every table. Anonymous users: execute only `list_departures`, `quote`, `hold_seats`, `get_booking_public(id, token)` (security definer functions); no direct table access.
- Staff: role checked in RLS via `staff` table. Desk can read departures/bookings and call desk functions; only admin can write vehicles/departures/settings.
- Booking result URL contains an unguessable token; public booking view exposes only that booking.
- Revolut secret key, webhook signing secret, Resend key stored as Supabase Edge Function secrets — never in git or the browser. Webhook signature verified.
- Basic abuse protection on `hold_seats`: max passengers per booking, limit on concurrent holds per email/IP.

### 6.11 Delivery & environments

- New GitHub repo `domerome77/ljubljana-airport` (does not exist yet; will be created). App source under `app/`, Supabase migrations and functions under `supabase/`. GitHub Actions builds the app and publishes to Pages under `/GoOpti-brnik-nov24/`.
- **Demo mode before credentials exist**: the frontend ships with an in-browser mock backend (seeded vans/departures, simulated payment) so the deployed URL is clickable immediately; it switches to Supabase automatically once `VITE_SUPABASE_URL`/anon key are configured. A visible "DEMO" ribbon in demo mode.
- Revolut sandbox first, then production key from the client.
- Tests: SQL tests for pricing/holds/concurrency (parallel holds on the last seat), unit tests for quote formatting, Playwright smoke test of the web booking flow against demo mode.

## 7. Decided by the client

- Approach A (GitHub Pages + Supabase + Resend + Revolut).
- English UI; no passenger registration; email mandatory online.
- Shared per-seat tiered pricing + group discounts; Private = whole vehicle.
- Vehicle name internal only; plate shown in the confirmation.
- Desk role sells the same seats and prints the confirmation.
- Invoice issuer Markun Borut d.o.o., sent as a separate email.
- Fiscalization deferred.
- Credentials/accounts (Supabase, Resend, Revolut, company data, meeting-point photo) supplied by the client when asked.

## 8. Builder's calls (proposed defaults, adjustable)

- No sales horizon (client: the 2 h rule does not exist). Sales close per departure, default 10 min before departure, same for web and desk; hold 15 min.
- One route per departure (a van goes either to Ljubljana or to Bled).
- Private offered only on departures with no shared seats sold.
- Max 8 passengers per shared booking online.
- Late-paid-after-expiry handling (§6.4).
- Invoice VAT 9.5 % assumption; invoice number format `YYYY-NNNNNN`.
- Demo mode with mock backend until Supabase exists.
- Hash routing; Vite + React + TypeScript; supabase-js.
- **Money flow** (confirmed by client): payments land on GoOpti's Revolut merchant account; invoices are issued in the name of Markun Borut d.o.o.
  Settlement between GoOpti and Markun happens outside the app; admin gets a sales/settlement CSV export per period (bookings, gross, VAT, channel, payment method).
- **Vehicle change after sale**: admin may change the vehicle on a departure if the new vehicle's seats ≥ seats sold; capacity is updated and every paid
  passenger automatically receives an updated confirmation email with the new plate (desk sees a "plate changed" flag). One vehicle per departure;
  two vans at the same time = two departures. Admin can **move a booking** to another departure on the same route (capacity-checked, re-notified) —
  this is also how overbooked cases are resolved.
- **Cancelling a paid booking** issues a **credit note** (dobropis) with its own numbering (`D-YYYY-NNNNNN`) referencing the invoice, emailed to the passenger;
  the original invoice is never deleted or altered. Refund money is returned manually in Revolut Business (non-goal §3).
- **Company invoice**: optional collapsed "Invoice to a company" section online and at the desk (company name, address, VAT ID); printed on the invoice as the buyer.

## 9. Open items needing client input (later, not blocking the build)

- Supabase project, Resend account (+ sending domain DNS), Revolut Merchant API keys (sandbox + production).
- Markun Borut d.o.o. invoice data (address, VAT ID, IBAN), VAT rate confirmation.
- Meeting-point photo + directions text; desk location text; support phone.
- Terms & conditions / cancellation policy text.
