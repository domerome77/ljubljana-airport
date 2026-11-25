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

Filled in when the Supabase backend is connected (plan Task 12).
