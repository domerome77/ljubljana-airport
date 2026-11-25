import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = ['0001_schema.sql', '0002_functions.sql', '0003_rls.sql'];

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export const ADMIN = '00000000-0000-0000-0000-0000000000a1';
export const DESK = '00000000-0000-0000-0000-0000000000d1';

export type Role = 'anon' | 'authenticated' | 'service_role';

export class TestDb {
  constructor(public db: PGlite) {}

  /** Run SQL as a Supabase role (optionally as a signed-in user). */
  async as<T = Record<string, unknown>>(role: Role, sql: string, params: unknown[] = [], uid?: string): Promise<T[]> {
    return this.db.transaction(async (tx: Transaction) => {
      await tx.exec(`set local role ${role}`);
      if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = await tx.query<T>(sql, params);
      return r.rows;
    });
  }

  async one<T = Record<string, unknown>>(role: Role, sql: string, params: unknown[] = [], uid?: string): Promise<T> {
    return (await this.as<T>(role, sql, params, uid))[0];
  }

  /** Error message (the code) thrown by a statement, or 'OK'. */
  async code(role: Role, sql: string, params: unknown[] = [], uid?: string): Promise<string> {
    try { await this.as(role, sql, params, uid); return 'OK'; } catch (e) { return (e as Error).message; }
  }

  async vehicle(seats = 8, plate = 'LJ-AB-123', name = 'Kombi Secret'): Promise<string> {
    const r = await this.db.query<{ id: string }>(`insert into vehicles (internal_name, plate, seats) values ($1, $2, $3) returning id`, [name, plate, seats]);
    return r.rows[0].id;
  }

  async departure(o: { vehicleId: string; inMinutes?: number; route?: string; tiers?: unknown; blocked?: number; close?: number; privatePrice?: number | null; sellPrivate?: boolean; sellShared?: boolean }): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `insert into departures (route_id, vehicle_id, departs_at, capacity, sell_shared, sell_private, private_price, sales_close_minutes, blocked_seats, tiers)
       select $1, v.id, now() + make_interval(mins => $2), v.seats, $8, $3, $4, $5, $6, $7::jsonb from vehicles v where v.id = $9 returning id`,
      [o.route ?? 'route-lj', o.inMinutes ?? 120, o.sellPrivate ?? true, o.privatePrice ?? null, o.close ?? 10, o.blocked ?? 0,
        JSON.stringify(o.tiers ?? [{ seatCount: 3, pricePerSeat: 12 }]), o.sellShared ?? true, o.vehicleId],
    );
    return r.rows[0].id;
  }

  async hold(dep: string, pax: number, opts: { product?: string; email?: string; channel?: string; uid?: string; role?: Role } = {}) {
    return this.one<{ hold_seats: { booking_id: string; token: string; amount: number; lines: unknown[] } }>(
      opts.role ?? 'anon', `select hold_seats($1, $2, $3, $4::jsonb, $5)`,
      [dep, opts.product ?? 'shared', pax, JSON.stringify({ name: 'Ana Novak', email: opts.email ?? 'ana@example.com' }), opts.channel ?? 'web'], opts.uid,
    ).then((r) => r.hold_seats);
  }
}

export async function freshDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of MIGRATIONS) await db.exec(readFileSync(join(__dirname, '..', 'migrations', f), 'utf8'));
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@test'), ('${DESK}', 'desk@test');
    insert into staff (user_id, email, role, display_name) values ('${ADMIN}', 'admin@test', 'admin', 'Admin'), ('${DESK}', 'desk@test', 'desk', 'Desk');
  `);
  return new TestDb(db);
}
