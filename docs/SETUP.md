# Setup & go-live

The app runs in **demo mode** (in-browser data, simulated payments) until the Supabase settings below are configured.

## What the client provides

| Item | Used for | Where it goes |
|---|---|---|
| Supabase project (URL, anon key, access to the dashboard) | Database, staff login, server functions | Repo variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public, safe); service key only as a Supabase secret |
| Resend account + verified sending domain | Ticket & invoice emails | Supabase secrets `RESEND_API_KEY`, `MAIL_FROM` |
| Revolut Merchant API keys (sandbox first, then production) + webhook signing secret | Card payments | Supabase secrets `REVOLUT_SECRET_KEY`, `REVOLUT_WEBHOOK_SECRET`, `REVOLUT_ENV` |
| Markun Borut d.o.o. invoice data (address, VAT ID, reg. no., IBAN), VAT rate | Invoices | Admin → Prices & settings |
| Meeting-point photo + directions, support phone | Ticket | Admin → Prices & settings |

Secrets are **never** committed to git and never reach the browser.

## Demo accounts (demo mode only)

- Admin: `admin@demo` / `demo`
- Desk: `desk@demo` / `demo`

## Go-live steps

All commands run from the repo root. `npx supabase` needs a Supabase access token (`npx supabase login`).

1. **Database**
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push            # applies supabase/migrations 0001–0004 (enable pg_cron first in Dashboard → Extensions)
   ```
2. **Secrets** (never in git):
   ```bash
   npx supabase secrets set REVOLUT_ENV=sandbox REVOLUT_SECRET_KEY=sk_... REVOLUT_WEBHOOK_SECRET=wsk_... \
     RESEND_API_KEY=re_... MAIL_FROM="GoOpti Airport Transfers <tickets@your-domain>" MAIL_REPLY_TO=info@your-domain \
     PUBLIC_BASE_URL=https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/
   ```
3. **Functions**
   ```bash
   npx supabase functions deploy create-checkout revolut-webhook staff-actions
   ```
4. **Revolut webhook** — register `https://<project-ref>.supabase.co/functions/v1/revolut-webhook` for `ORDER_COMPLETED`
   (`POST /api/webhooks` with `{ "url": ..., "events": ["ORDER_COMPLETED"] }`, or in the Revolut Business dashboard).
   Copy the webhook's signing secret into `REVOLUT_WEBHOOK_SECRET`.
5. **First admin** — Supabase Dashboard → Authentication → invite the admin's email, then in SQL editor:
   `insert into staff (user_id, email, role, display_name) select id, email, 'admin', 'Admin' from auth.users where email = '<email>';`
   Further staff are invited from **Admin → Staff** (they receive an email and set their password).
   Add the site URL `https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/` under Authentication → URL configuration.
6. **Frontend** — GitHub repo → Settings → Variables → Actions: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public keys), then re-run the Pages workflow.
   The DEMO ribbon disappears and the app uses the real backend.
7. **Sandbox test** — book online with a Revolut test card, check both emails, book at the desk, cancel (credit note),
   and fire two holds for the last seat at the same time (exactly one must succeed).
8. **Production** — `REVOLUT_ENV=production` + production secret key + a production webhook.

## Revolut Merchant API (verified 2026-11-25 against developer.revolut.com)

- `POST {base}/api/orders`, headers `Authorization: Bearer <secret>`, `Revolut-Api-Version: 2026-09-22`.
- Base URL: `https://merchant.revolut.com` (production), `https://sandbox-merchant.revolut.com` (sandbox — confirm in the sandbox dashboard).
- Body used: `amount` (minor units), `currency: EUR`, `description`, `customer.email`, `merchant_order_data.reference` (= booking ref),
  `redirect_url` (hosted checkout redirects here after success), `expire_pending_after` (= remaining seat-hold time). Response: `id`, `checkout_url`.
- Webhooks: headers `Revolut-Request-Timestamp`, `Revolut-Signature` (`v1=<hex>`, comma-separated if several);
  HMAC-SHA256 of `v1.{timestamp}.{raw body}` with the webhook signing secret; 5-minute tolerance. Event `ORDER_COMPLETED` with `order_id`.

## How payment confirmation works

The browser is redirected back to the ticket page, but **only the webhook marks a booking as paid** (`mark_paid`, idempotent).
The ticket page polls until the webhook arrives. If a payment arrives after the 15-minute seat hold expired and the seats were resold,
the booking is marked *overbooked* and shown in red on the admin Today board for manual resolution (move to another van or refund).
