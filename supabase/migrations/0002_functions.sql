-- LJU Airport Shuttle — business functions.
-- Rules mirror app/src/domain/*.ts and app/src/api/mock/MockApi.ts; the shared vectors keep pricing in sync.
-- Errors: RAISE with MESSAGE = code (SOLD_OUT | SALES_CLOSED | INVALID | NOT_FOUND | FORBIDDEN | CONFLICT), DETAIL = human text.

create or replace function _err(p_code text, p_detail text default null) returns void
language plpgsql as $$
begin
  raise exception using message = p_code, detail = coalesce(p_detail, p_code), errcode = 'P0001';
end $$;

create or replace function _settings() returns jsonb
language sql stable security definer set search_path = public as $$ select data from settings where id = 1 $$;

create or replace function _staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and active
$$;

create or replace function _require(p_roles text[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text := _staff_role();
begin
  if r is null or not (r = any(p_roles)) then perform _err('FORBIDDEN', 'Not allowed'); end if;
  return r;
end $$;

create or replace function _fmt_eur(p numeric) returns text
language sql immutable as $$ select to_char(p, 'FM999999990.00') || ' €' $$;

create or replace function _fmt_pct(p numeric) returns text
language sql immutable as $$ select case when p = trunc(p) then trunc(p)::text else rtrim(p::text, '0') end $$;

-- Seats counted against capacity: paid (incl. overbooked) and unexpired holds.
create or replace function _taken(p_dep uuid, p_except uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(seats_taken), 0)::int from bookings
  where departure_id = p_dep and (p_except is null or id <> p_except)
    and (status in ('paid', 'paid_overbooked') or (status = 'held' and hold_expires_at > now()))
$$;

create or replace function _left(d departures, p_except uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, d.capacity - d.blocked_seats - _taken(d.id, p_except))
$$;

create or replace function _sellable(d departures) returns boolean
language sql stable as $$
  select d.status = 'scheduled' and now() < d.departs_at - make_interval(mins => d.sales_close_minutes)
$$;

-- Price of the n-th seat (1-based) using fill-based tiers.
create or replace function _seat_price(p_tiers jsonb, p_default numeric, p_n int) returns numeric
language plpgsql immutable as $$
declare t jsonb; upper int := 0;
begin
  for t in select value from jsonb_array_elements(p_tiers) loop
    upper := upper + (t->>'seatCount')::int;
    if p_n <= upper then return (t->>'pricePerSeat')::numeric; end if;
  end loop;
  return p_default;
end $$;

create or replace function _route_code(p_route text) returns text
language sql stable security definer set search_path = public as $$ select code from routes where id = p_route $$;

-- Quote = app/src/domain/pricing.ts (quoteShared / quotePrivate). Tier position counts seats taken in this app only.
create or replace function _quote(d departures, p_product text, p_pax int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s jsonb := _settings(); rc text := _route_code(d.route_id); taken int; n int;
  price numeric; prev numeric := null; cnt int := 0; cents bigint := 0; pct numeric; off bigint; lines jsonb := '[]';
begin
  if p_product = 'private' then
    price := coalesce(d.private_price, (s->'defaultPrivatePrice'->>rc)::numeric);
    return jsonb_build_object('amount', round(price, 2),
      'lines', jsonb_build_array(jsonb_build_object('label', 'Private van', 'amount', round(price, 2))));
  end if;
  taken := _taken(d.id);
  for n in taken + 1 .. taken + p_pax loop
    price := _seat_price(d.tiers, (s->'defaultSeatPrice'->>rc)::numeric, n);
    if prev is not null and price <> prev then
      lines := lines || jsonb_build_object('label', cnt || ' × ' || _fmt_eur(prev), 'amount', round(round(prev * 100) * cnt / 100.0, 2));
      cnt := 0;
    end if;
    prev := price; cnt := cnt + 1; cents := cents + round(price * 100);
  end loop;
  if cnt > 0 then
    lines := lines || jsonb_build_object('label', cnt || ' × ' || _fmt_eur(prev), 'amount', round(round(prev * 100) * cnt / 100.0, 2));
  end if;
  select coalesce(max((x->>'percent')::numeric), 0) into pct
    from jsonb_array_elements(s->'groupDiscounts') x where p_pax >= (x->>'minPassengers')::int;
  if pct > 0 then
    off := round(cents * pct / 100);
    lines := lines || jsonb_build_object('label', 'Group discount ' || _fmt_pct(pct) || ' %', 'amount', -round(off / 100.0, 2));
    cents := cents - off;
  end if;
  return jsonb_build_object('amount', round(cents / 100.0, 2), 'lines', lines);
end $$;

create or replace function _booking_json(b bookings) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'ref', b.ref, 'token', b.token, 'departureId', b.departure_id, 'product', b.product, 'passengers', b.passengers,
    'seatsTaken', b.seats_taken, 'amount', b.amount, 'breakdown', b.breakdown, 'buyer', b.buyer, 'channel', b.channel,
    'status', b.status, 'holdExpiresAt', b.hold_expires_at, 'paymentMethod', b.payment_method, 'paidAt', b.paid_at,
    'createdAt', b.created_at,
    'invoiceNumber', (select number from invoices i where i.booking_id = b.id and i.kind = 'invoice'),
    'creditNoteNumber', (select number from invoices i where i.booking_id = b.id and i.kind = 'credit_note'))
$$;

create or replace function _random_ref() returns text
language sql volatile as $$
  select 'LJU-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;

-- ---------------------------------------------------------------- public API

create or replace function list_departures(p_route text)
returns table (id uuid, route_code text, departs_at timestamptz, seats_left int, capacity int, shared_from_price numeric, private_price numeric)
language sql stable security definer set search_path = public as $$
  select d.id, r.code, d.departs_at, x.lft, d.capacity,
    case when d.sell_shared and x.lft > 0 then _seat_price(d.tiers, (s.data->'defaultSeatPrice'->>r.code)::numeric, t.tk + 1) end,
    case when d.sell_private and x.lft = d.capacity then coalesce(d.private_price, (s.data->'defaultPrivatePrice'->>r.code)::numeric) end
  from departures d
  join routes r on r.id = d.route_id
  cross join settings s
  cross join lateral (select _taken(d.id) as tk) t
  cross join lateral (select greatest(0, d.capacity - d.blocked_seats - t.tk) as lft) x
  where r.code = p_route and _sellable(d) and x.lft > 0 and (d.sell_shared or (d.sell_private and x.lft = d.capacity))
  order by d.departs_at
$$;

create or replace function quote(p_departure uuid, p_product text, p_passengers int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d departures;
begin
  select * into d from departures where id = p_departure;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
  return _quote(d, p_product, p_passengers) || jsonb_build_object('seatsLeft', _left(d));
end $$;

create or replace function _create_hold(p_departure uuid, p_product text, p_pax int, p_buyer jsonb, p_channel text) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _settings(); d departures; b bookings; lft int; q jsonb; email text := nullif(trim(p_buyer->>'email'), '');
  re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$'; v_buyer jsonb;
begin
  if p_channel not in ('web', 'desk') then perform _err('INVALID', 'Unknown channel'); end if;
  if p_channel = 'desk' then perform _require(array['desk', 'admin']); end if;
  if p_product not in ('shared', 'private') then perform _err('INVALID', 'Unknown product'); end if;
  if coalesce(trim(p_buyer->>'name'), '') = '' then perform _err('INVALID', 'Name is required'); end if;
  if p_channel = 'web' and (email is null or email !~ re) then perform _err('INVALID', 'Email is required'); end if;
  if email is not null and email !~ re then perform _err('INVALID', 'Email is invalid'); end if;
  if p_pax is null or p_pax < 1 then perform _err('INVALID', 'Invalid number of passengers'); end if;
  if p_channel = 'web' and p_product = 'shared' and p_pax > (s->>'maxPassengersOnline')::int then
    perform _err('INVALID', format('Online bookings are limited to %s passengers', s->>'maxPassengersOnline'));
  end if;

  select * into d from departures where id = p_departure for update;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
  if d.status <> 'scheduled' then perform _err('SALES_CLOSED', 'This departure is cancelled'); end if;
  if not _sellable(d) then perform _err('SALES_CLOSED', 'Sales for this departure have closed'); end if;
  if p_product = 'shared' and not d.sell_shared then perform _err('INVALID', 'Shared seats are not sold on this departure'); end if;
  if p_product = 'private' and p_pax > d.capacity then perform _err('INVALID', format('This van takes up to %s people', d.capacity)); end if;
  if p_channel = 'web' and (select count(*) from bookings where status = 'held' and hold_expires_at > now() and lower(buyer->>'email') = lower(email)) >= 3 then
    perform _err('INVALID', 'Too many unfinished bookings — please complete or wait a few minutes');
  end if;

  lft := _left(d);
  if (p_product = 'private' and not (d.sell_private and lft = d.capacity)) or (p_product = 'shared' and p_pax > lft) then
    perform _err('SOLD_OUT', 'Those seats were just taken');
  end if;

  q := _quote(d, p_product, p_pax);
  v_buyer := jsonb_strip_nulls(jsonb_build_object('name', trim(p_buyer->>'name'), 'email', email,
    'phone', nullif(trim(p_buyer->>'phone'), ''), 'company', p_buyer->'company'));
  loop
    begin
      insert into bookings (ref, token, departure_id, product, passengers, seats_taken, amount, breakdown, buyer, channel, status, hold_expires_at, created_by)
      values (_random_ref(), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), d.id, p_product, p_pax,
        case when p_product = 'private' then d.capacity else p_pax end, (q->>'amount')::numeric, q->'lines', v_buyer, p_channel, 'held',
        now() + make_interval(mins => (s->>'holdMinutes')::int), auth.uid())
      returning * into b;
      exit;
    exception when unique_violation then -- ref collision, retry
    end;
  end loop;
  return b;
end $$;

create or replace function hold_seats(p_departure uuid, p_product text, p_passengers int, p_buyer jsonb, p_channel text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings := _create_hold(p_departure, p_product, p_passengers, p_buyer, p_channel);
begin
  return jsonb_build_object('booking_id', b.id, 'token', b.token, 'amount', b.amount, 'lines', b.breakdown, 'hold_expires_at', b.hold_expires_at);
end $$;

create or replace function get_booking_public(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings; d departures; r routes; s jsonb := _settings(); plate text;
begin
  select * into b from bookings where id = p_id and token = p_token;
  if not found then perform _err('NOT_FOUND', 'Booking not found'); end if;
  if b.status = 'held' and b.hold_expires_at <= now() then
    update bookings set status = 'expired' where id = b.id returning * into b;
  end if;
  select * into d from departures where id = b.departure_id;
  select * into r from routes where id = d.route_id;
  if b.status in ('paid', 'paid_overbooked') then select v.plate into plate from vehicles v where v.id = d.vehicle_id; end if;
  return jsonb_build_object('ref', b.ref, 'status', b.status, 'routeCode', r.code, 'routeName', r.name, 'destinationLabel', r.destination_label,
    'departsAt', d.departs_at, 'product', b.product, 'passengers', b.passengers, 'amount', b.amount, 'lines', b.breakdown, 'plate', plate,
    'meetingPoint', s->'meetingPoint', 'supportPhone', s->>'supportPhone', 'buyerName', b.buyer->>'name', 'holdExpiresAt', b.hold_expires_at);
end $$;

-- ---------------------------------------------------------------- payments & invoices

create or replace function _next_number(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare y int := extract(year from now() at time zone 'Europe/Ljubljana')::int; n int; prefix text := coalesce(_settings()->>'invoicePrefix', '');
begin
  insert into counters (year, kind, last) values (y, p_kind, 1)
    on conflict (year, kind) do update set last = counters.last + 1
    returning last into n;
  return case when p_kind = 'credit_note' then 'D-' else prefix end || y || '-' || lpad(n::text, 6, '0');
end $$;

create or replace function _issue(b bookings, p_kind text, p_refers uuid default null) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _settings(); d departures; r routes; inv invoices; rate numeric := (s->>'vatRate')::numeric;
  sign int := case when p_kind = 'credit_note' then -1 else 1 end; gross numeric := sign * b.amount; net numeric; descr text;
begin
  select * into d from departures where id = b.departure_id;
  select * into r from routes where id = d.route_id;
  net := round(gross / (1 + rate), 2);
  descr := format('Airport transfer %s, %s, %s, %s %s', r.name,
    to_char(d.departs_at at time zone 'Europe/Ljubljana', 'HH24:MI DD Mon YYYY'),
    case when b.product = 'private' then 'private van' else 'shared' end,
    b.passengers, case when b.passengers = 1 then 'person' else 'people' end);
  insert into invoices (booking_id, kind, number, refers_to_invoice_id, service_date, issuer, buyer, lines, vat_rate, net, vat, gross, payment_method)
  values (b.id, p_kind, _next_number(p_kind), p_refers, (d.departs_at at time zone 'Europe/Ljubljana')::date, s->'company', b.buyer,
    jsonb_build_array(jsonb_build_object('description', descr, 'qty', 1, 'unitGross', gross, 'gross', gross)), rate, net, gross - net, gross, b.payment_method)
  returning * into inv;
  return inv;
end $$;

create or replace function _invoice_json(i invoices) returns jsonb
language sql stable as $$
  select case when i.id is null then null else jsonb_build_object('id', i.id, 'kind', i.kind, 'number', i.number, 'issuedAt', i.issued_at,
    'serviceDate', i.service_date, 'company', i.issuer, 'buyer', i.buyer, 'lines', i.lines, 'vatRate', i.vat_rate, 'net', i.net, 'vat', i.vat,
    'gross', i.gross, 'paymentMethod', i.payment_method, 'refersTo', (select number from invoices x where x.id = i.refers_to_invoice_id)) end
$$;

create or replace function _mark_paid(p_booking uuid, p_method text, p_revolut_order text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings; d departures; inv invoices; fits boolean; expired boolean;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then perform _err('NOT_FOUND', 'Booking not found'); end if;
  if b.status in ('paid', 'paid_overbooked') then
    select * into inv from invoices where booking_id = b.id and kind = 'invoice';
    return jsonb_build_object('booking', _booking_json(b), 'invoice', _invoice_json(inv), 'alreadyPaid', true);
  end if;
  select * into d from departures where id = b.departure_id for update;
  expired := b.status <> 'held' or b.hold_expires_at <= now();
  fits := _left(d, b.id) >= b.seats_taken;
  update bookings set status = case when expired and not fits then 'paid_overbooked' else 'paid' end,
    payment_method = p_method, revolut_order_id = coalesce(p_revolut_order, revolut_order_id), paid_at = now(), hold_expires_at = null
    where id = b.id returning * into b;
  inv := _issue(b, 'invoice');
  return jsonb_build_object('booking', _booking_json(b), 'invoice', _invoice_json(inv), 'alreadyPaid', false);
end $$;

-- Called by the Revolut webhook (service role only).
create or replace function mark_paid(p_booking uuid, p_method text, p_revolut_order text) returns jsonb
language sql security definer set search_path = public as $$ select _mark_paid(p_booking, p_method, p_revolut_order) $$;

create or replace function desk_book(p_departure uuid, p_product text, p_passengers int, p_buyer jsonb, p_method text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  perform _require(array['desk', 'admin']);
  if p_method not in ('desk_card', 'desk_cash') then perform _err('INVALID', 'Choose card or cash'); end if;
  b := _create_hold(p_departure, p_product, p_passengers, p_buyer, 'desk');
  return _mark_paid(b.id, p_method, null);
end $$;

-- Booking + invoice data for emails (service role only).
create or replace function booking_documents(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking;
  if not found then perform _err('NOT_FOUND'); end if;
  return jsonb_build_object('booking', _booking_json(b), 'view', get_booking_public(b.id, b.token),
    'invoice', (select _invoice_json(i) from invoices i where i.booking_id = b.id and i.kind = 'invoice'),
    'creditNote', (select _invoice_json(i) from invoices i where i.booking_id = b.id and i.kind = 'credit_note'));
end $$;

create or replace function expire_holds() returns int
language sql security definer set search_path = public as $$
  with x as (update bookings set status = 'expired' where status = 'held' and hold_expires_at <= now() returning 1) select count(*)::int from x
$$;

-- ---------------------------------------------------------------- staff

create or replace function _departure_json(d departures) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'routeId', d.route_id, 'vehicleId', d.vehicle_id, 'departsAt', d.departs_at, 'capacity', d.capacity,
    'sellShared', d.sell_shared, 'sellPrivate', d.sell_private, 'privatePrice', d.private_price, 'salesCloseMinutes', d.sales_close_minutes,
    'blockedSeats', d.blocked_seats, 'blockedNote', d.blocked_note, 'status', d.status, 'tiers', d.tiers, 'notes', d.notes,
    'vehicleChangedAt', d.vehicle_changed_at)
$$;

create or replace function _validate_prices(p jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare s jsonb := _settings(); t jsonb; pp numeric := nullif(p->>'privatePrice', '')::numeric;
begin
  for t in select value from jsonb_array_elements(coalesce(p->'tiers', '[]')) loop
    if coalesce((t->>'seatCount')::int, 0) < 1 then perform _err('INVALID', 'Each price tier needs at least 1 seat'); end if;
    if (t->>'pricePerSeat')::numeric < (s->>'minSeatPrice')::numeric or (t->>'pricePerSeat')::numeric > (s->>'maxSeatPrice')::numeric then
      perform _err('INVALID', format('Price must be between %s € and %s €', s->>'minSeatPrice', s->>'maxSeatPrice'));
    end if;
  end loop;
  if pp is not null and (pp < (s->>'minPrivatePrice')::numeric or pp > (s->>'maxPrivatePrice')::numeric) then
    perform _err('INVALID', format('Private price must be between %s € and %s €', s->>'minPrivatePrice', s->>'maxPrivatePrice'));
  end if;
end $$;

create or replace function save_departure(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  existing departures; d departures; v vehicles; taken int := 0; blocked int := coalesce((p->>'blockedSeats')::int, 0);
  close int := coalesce((p->>'salesCloseMinutes')::int, (_settings()->>'defaultSalesCloseMinutes')::int); changed boolean := false;
begin
  perform _require(array['admin']);
  perform _validate_prices(p);
  if not exists (select 1 from routes where id = p->>'routeId') then perform _err('INVALID', 'Choose a route'); end if;
  select * into v from vehicles where id = (p->>'vehicleId')::uuid;
  if not found then perform _err('NOT_FOUND', 'Vehicle not found'); end if;
  if close < 0 then perform _err('INVALID', 'Sales close must be 0 minutes or more'); end if;
  if blocked < 0 then perform _err('INVALID', 'Blocked seats cannot be negative'); end if;
  if p ? 'id' and p->>'id' is not null then
    select * into existing from departures where id = (p->>'id')::uuid for update;
    if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
    taken := _taken(existing.id);
    changed := existing.vehicle_id <> v.id;
    if changed and v.seats < taken + blocked then
      perform _err('CONFLICT', format('New vehicle has %s seats but %s are already taken', v.seats, taken + blocked));
    end if;
  end if;
  if blocked > v.seats - taken then
    perform _err('CONFLICT', format('Only %s seats can be blocked (%s already taken)', v.seats - taken, taken));
  end if;
  if existing.id is null then
    insert into departures (route_id, vehicle_id, departs_at, capacity, sell_shared, sell_private, private_price, sales_close_minutes, blocked_seats, blocked_note, tiers, notes)
    values (p->>'routeId', v.id, (p->>'departsAt')::timestamptz, v.seats, coalesce((p->>'sellShared')::boolean, true), coalesce((p->>'sellPrivate')::boolean, true),
      nullif(p->>'privatePrice', '')::numeric, close, blocked, nullif(p->>'blockedNote', ''), coalesce(p->'tiers', '[]'), nullif(p->>'notes', ''))
    returning * into d;
  else
    update departures set route_id = p->>'routeId', vehicle_id = v.id, departs_at = (p->>'departsAt')::timestamptz, capacity = v.seats,
      sell_shared = coalesce((p->>'sellShared')::boolean, true), sell_private = coalesce((p->>'sellPrivate')::boolean, true),
      private_price = nullif(p->>'privatePrice', '')::numeric, sales_close_minutes = close, blocked_seats = blocked,
      blocked_note = nullif(p->>'blockedNote', ''), tiers = coalesce(p->'tiers', '[]'), notes = nullif(p->>'notes', ''),
      vehicle_changed_at = case when changed then now() else vehicle_changed_at end
    where id = existing.id returning * into d;
  end if;
  return _departure_json(d) || jsonb_build_object('vehicleChanged', changed);
end $$;

create or replace function repeat_departure(p_template uuid, p_from date, p_to date, p_weekdays int[]) returns int
language plpgsql security definer set search_path = public as $$
declare t departures; local_time time; day date; at timestamptz; n int := 0;
begin
  perform _require(array['admin']);
  select * into t from departures where id = p_template;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
  if p_to < p_from or p_to - p_from > 366 then perform _err('INVALID', 'Choose a valid date range (max one year)'); end if;
  local_time := (t.departs_at at time zone 'Europe/Ljubljana')::time;
  for day in select generate_series(p_from, p_to, interval '1 day')::date loop
    if not (extract(isodow from day)::int = any(p_weekdays)) then continue; end if;
    at := (day + local_time) at time zone 'Europe/Ljubljana';
    if at = t.departs_at then continue; end if;
    insert into departures (route_id, vehicle_id, departs_at, capacity, sell_shared, sell_private, private_price, sales_close_minutes, blocked_seats, tiers, notes)
    values (t.route_id, t.vehicle_id, at, t.capacity, t.sell_shared, t.sell_private, t.private_price, t.sales_close_minutes, 0, t.tiers, t.notes);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function cancel_departure(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require(array['admin']);
  if exists (select 1 from bookings where departure_id = p_id and status in ('paid', 'paid_overbooked')) then
    perform _err('CONFLICT', 'This departure has paid bookings — move or cancel them first');
  end if;
  update departures set status = 'cancelled' where id = p_id;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
end $$;

create or replace function cancel_booking(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings; inv invoices; cn invoices;
begin
  perform _require(array['admin']);
  select * into b from bookings where id = p_booking for update;
  if not found then perform _err('NOT_FOUND', 'Booking not found'); end if;
  if b.status in ('paid', 'paid_overbooked') then
    select * into inv from invoices where booking_id = b.id and kind = 'invoice';
    cn := _issue(b, 'credit_note', inv.id);
  end if;
  update bookings set status = 'cancelled', hold_expires_at = null where id = b.id returning * into b;
  return jsonb_build_object('booking', _booking_json(b), 'credit_note', _invoice_json(cn));
end $$;

create or replace function move_booking(p_booking uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bookings; f departures; t departures; lft int;
begin
  perform _require(array['admin']);
  select * into b from bookings where id = p_booking for update;
  if not found then perform _err('NOT_FOUND', 'Booking not found'); end if;
  select * into f from departures where id = b.departure_id;
  select * into t from departures where id = p_to for update;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
  if t.route_id <> f.route_id then perform _err('INVALID', 'You can only move a booking to the same route'); end if;
  lft := _left(t);
  if (b.product = 'private' and lft <> t.capacity) or (b.product = 'shared' and lft < b.seats_taken) then
    perform _err('SOLD_OUT', 'Not enough free seats on that departure');
  end if;
  update bookings set departure_id = t.id, seats_taken = case when product = 'private' then t.capacity else seats_taken end,
    status = case when status = 'paid_overbooked' then 'paid' else status end
  where id = b.id returning * into b;
  return _booking_json(b);
end $$;

create or replace function admin_departures(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require(array['admin', 'desk']);
  return coalesce((
    select jsonb_agg(_departure_json(d) || jsonb_build_object(
      'routeCode', r.code, 'plate', v.plate, 'vehicleName', v.internal_name,
      'soldSeats', coalesce((select sum(seats_taken) from bookings b where b.departure_id = d.id and b.status in ('paid', 'paid_overbooked')), 0),
      'heldSeats', coalesce((select sum(seats_taken) from bookings b where b.departure_id = d.id and b.status = 'held' and b.hold_expires_at > now()), 0),
      'seatsLeft', _left(d),
      'revenue', coalesce((select sum(amount) from bookings b where b.departure_id = d.id and b.status in ('paid', 'paid_overbooked')), 0),
      'problems', case when exists (select 1 from bookings b where b.departure_id = d.id and b.status = 'paid_overbooked')
        then jsonb_build_array('Overbooked — a payment arrived after the hold expired') else '[]'::jsonb end)
      order by d.departs_at)
    from departures d join routes r on r.id = d.route_id join vehicles v on v.id = d.vehicle_id
    where d.departs_at >= p_from and d.departs_at < p_to), '[]'::jsonb);
end $$;

create or replace function admin_bookings(p_text text, p_from timestamptz, p_to timestamptz, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := nullif(lower(trim(coalesce(p_text, ''))), '');
begin
  perform _require(array['admin', 'desk']);
  perform expire_holds();
  return coalesce((
    select jsonb_agg(_booking_json(b) || jsonb_build_object('departsAt', d.departs_at, 'routeCode', r.code, 'plate', v.plate) order by b.created_at desc)
    from bookings b join departures d on d.id = b.departure_id join routes r on r.id = d.route_id join vehicles v on v.id = d.vehicle_id
    where (q is null or lower(b.ref) like '%' || q || '%' or lower(b.buyer->>'name') like '%' || q || '%'
           or lower(coalesce(b.buyer->>'email', '')) like '%' || q || '%' or lower(coalesce(b.buyer->'company'->>'name', '')) like '%' || q || '%')
      and (p_from is null or d.departs_at >= p_from) and (p_to is null or d.departs_at < p_to)
      and (p_status is null or b.status = p_status)), '[]'::jsonb);
end $$;

create or replace function manifest(p_departure uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d departures;
begin
  perform _require(array['admin', 'desk']);
  select * into d from departures where id = p_departure;
  if not found then perform _err('NOT_FOUND', 'Departure not found'); end if;
  return jsonb_build_object(
    'departure', (select x from jsonb_array_elements(admin_departures(d.departs_at, d.departs_at + interval '1 second')) x where x->>'id' = d.id::text),
    'bookings', coalesce((select jsonb_agg(_booking_json(b) order by b.created_at) from bookings b where b.departure_id = d.id and b.status in ('paid', 'paid_overbooked')), '[]'::jsonb));
end $$;
