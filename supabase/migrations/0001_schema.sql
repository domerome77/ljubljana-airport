-- LJU Airport Shuttle — schema
-- Money in EUR (numeric(10,2)); times are timestamptz and are shown in Europe/Ljubljana by the app.

create table routes (
  id text primary key,
  code text not null unique check (code in ('LJU-LJ', 'LJU-BLED')),
  name text not null,
  destination_label text not null,
  active boolean not null default true
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null default '',          -- never exposed to passengers
  plate text not null,
  seats int not null check (seats between 1 and 60),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table departures (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references routes(id),
  vehicle_id uuid not null references vehicles(id),
  departs_at timestamptz not null,
  capacity int not null check (capacity between 1 and 60),
  sell_shared boolean not null default true,
  sell_private boolean not null default true,
  private_price numeric(10,2),
  sales_close_minutes int not null default 10 check (sales_close_minutes >= 0),
  blocked_seats int not null default 0 check (blocked_seats >= 0),
  blocked_note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  tiers jsonb not null default '[]',               -- [{ "seatCount": 3, "pricePerSeat": 12 }, ...] in fill order
  notes text,
  vehicle_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index departures_route_time on departures (route_id, departs_at);

-- Single-row settings document; shape = app/src/domain/types.ts `Settings`.
create table settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  token text not null,
  departure_id uuid not null references departures(id),
  product text not null check (product in ('shared', 'private')),
  passengers int not null check (passengers >= 1),
  seats_taken int not null check (seats_taken >= 1),
  amount numeric(10,2) not null,
  breakdown jsonb not null default '[]',
  buyer jsonb not null,                            -- { name, email?, phone?, company?: { name, address, vatId } }
  channel text not null check (channel in ('web', 'desk')),
  status text not null check (status in ('held', 'paid', 'paid_overbooked', 'cancelled', 'expired')),
  hold_expires_at timestamptz,
  payment_method text check (payment_method in ('revolut', 'desk_card', 'desk_cash')),
  revolut_order_id text,
  revolut_checkout_url text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bookings_departure on bookings (departure_id, status);
create index bookings_email on bookings ((lower(buyer->>'email')));

create table invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  kind text not null check (kind in ('invoice', 'credit_note')),
  number text not null unique,
  refers_to_invoice_id uuid references invoices(id),
  issued_at timestamptz not null default now(),
  service_date date not null,
  issuer jsonb not null,
  buyer jsonb not null,
  lines jsonb not null,
  vat_rate numeric(6,4) not null,
  net numeric(10,2) not null,
  vat numeric(10,2) not null,
  gross numeric(10,2) not null,
  payment_method text,
  sent_at timestamptz
);
create unique index invoices_one_per_booking on invoices (booking_id, kind);

create table counters (
  year int not null,
  kind text not null,
  last int not null default 0,
  primary key (year, kind)
);

create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'desk')),
  display_name text not null default '',
  active boolean not null default true
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  kind text not null check (kind in ('confirmation', 'invoice', 'credit_note', 'update')),
  to_email text not null,
  provider_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

insert into routes (id, code, name, destination_label) values
  ('route-lj', 'LJU-LJ', 'Ljubljana Airport → Ljubljana', 'Ljubljana — any address'),
  ('route-bled', 'LJU-BLED', 'Ljubljana Airport → Bled', 'Bled — any address');

-- Defaults mirror app/src/api/mock/seed.ts defaultSettings() (asserted by tests/pricing.test.ts).
insert into settings (id, data) values (1, $json$
{
  "defaultSeatPrice": { "LJU-LJ": 14, "LJU-BLED": 25 },
  "defaultPrivatePrice": { "LJU-LJ": 70, "LJU-BLED": 120 },
  "tierTemplate": {
    "LJU-LJ": [{ "seatCount": 3, "pricePerSeat": 12 }, { "seatCount": 3, "pricePerSeat": 14 }],
    "LJU-BLED": [{ "seatCount": 3, "pricePerSeat": 22 }, { "seatCount": 3, "pricePerSeat": 25 }]
  },
  "minSeatPrice": 5, "maxSeatPrice": 60, "minPrivatePrice": 30, "maxPrivatePrice": 400,
  "groupDiscounts": [{ "minPassengers": 3, "percent": 5 }, { "minPassengers": 5, "percent": 10 }],
  "defaultSalesCloseMinutes": 10, "holdMinutes": 15, "maxPassengersOnline": 8,
  "company": {
    "name": "Markun Borut d.o.o.", "address": "Address to be provided", "vatId": "SI00000000", "regNo": "0000000000",
    "iban": "SI56 0000 0000 0000 000", "email": "info@example.com", "phone": "+386 00 000 000"
  },
  "vatRate": 0.095, "invoicePrefix": "",
  "meetingPoint": {
    "imageUrl": "assets/meeting-point-lju.jpg",
    "text": "From the arrivals exit, turn right and walk along the terminal past the GoOpti info desk. Cross the road at the pedestrian crossing and turn left to the GoOpti shuttle points 1–2 (departures to Ljubljana and Bled) — about 3 minutes. Look for the plate on your ticket."
  },
  "supportPhone": "+386 00 000 000"
}
$json$::jsonb);
