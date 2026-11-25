-- LJU Airport Shuttle — access control.
-- Passengers (anon) never touch tables: they call list_departures / quote / hold_seats / get_booking_public.
-- Staff read through RLS; all writes that touch seats go through security-definer functions.

create or replace function _is_staff(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active and role = any(p_roles))
$$;

alter table routes enable row level security;
alter table vehicles enable row level security;
alter table departures enable row level security;
alter table settings enable row level security;
alter table bookings enable row level security;
alter table invoices enable row level security;
alter table counters enable row level security;
alter table staff enable row level security;
alter table email_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on routes to anon, authenticated;
grant select, insert, update on vehicles to authenticated;
grant select, update on settings to authenticated;
grant select on departures, bookings, invoices, staff, email_log to authenticated;
grant all on all tables in schema public to service_role;

create policy routes_read on routes for select using (true);
create policy vehicles_read on vehicles for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy vehicles_insert on vehicles for insert to authenticated with check (_is_staff(array['admin']));
create policy vehicles_update on vehicles for update to authenticated using (_is_staff(array['admin'])) with check (_is_staff(array['admin']));
create policy settings_read on settings for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy settings_update on settings for update to authenticated using (_is_staff(array['admin'])) with check (_is_staff(array['admin']));
create policy departures_read on departures for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy bookings_read on bookings for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy invoices_read on invoices for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy email_log_read on email_log for select to authenticated using (_is_staff(array['admin', 'desk']));
create policy staff_read on staff for select to authenticated using (user_id = auth.uid() or _is_staff(array['admin']));

-- Functions: nothing is executable unless granted below.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function list_departures(text), quote(uuid, text, int), hold_seats(uuid, text, int, jsonb, text),
  get_booking_public(uuid, text) to anon, authenticated;
grant execute on function desk_book(uuid, text, int, jsonb, text), save_departure(jsonb), repeat_departure(uuid, date, date, int[]),
  cancel_departure(uuid), cancel_booking(uuid), move_booking(uuid, uuid), admin_departures(timestamptz, timestamptz),
  admin_bookings(text, timestamptz, timestamptz, text), manifest(uuid), _is_staff(text[]) to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
