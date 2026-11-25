# GoOpti LJU Airport Shuttle

Seat-selling app for Ljubljana Airport → Ljubljana / Bled vans (operated by Markun Borut d.o.o.).

- Live: https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/
- `app/` — React SPA (public landing, `#/desk`, `#/admin`). Demo mode when `VITE_SUPABASE_URL` is empty.
- `supabase/` — database migrations, SQL tests, Edge Functions (Revolut, email, invoices).
- `docs/spec.md`, `docs/plan.md`, `docs/SETUP.md`.

```bash
cd app && npm install && npm run dev
npm test
```
