// Wires handler dependencies to real services. Runs in Supabase Edge Functions (Deno).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Deps, Documents, HeldBooking } from './handlers.ts';
import { buildInvoicePdf } from './invoicePdf.ts';
import { sendEmail } from './resend.ts';
import { createRevolutOrder, REVOLUT_API_VERSION, revolutBaseUrl } from './revolut.ts';

declare const Deno: { env: { get(k: string): string | undefined } };
const env = (k: string, fallback?: string): string => {
  const v = Deno.env.get(k) ?? fallback;
  if (v === undefined) throw new Error(`Missing secret ${k}`);
  return v;
};

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export function makeDeps(sb: SupabaseClient = serviceClient()): Deps {
  return {
    db: {
      async getHeldBooking(id, token): Promise<HeldBooking | null> {
        const { data } = await sb.from('bookings').select('id, token, ref, amount, buyer, status, hold_expires_at, revolut_order_id, revolut_checkout_url, departures(routes(name))').eq('id', id).eq('token', token).maybeSingle();
        if (!data) return null;
        // deno-lint-ignore no-explicit-any
        const d = data as any;
        return { id: d.id, token: d.token, ref: d.ref, amount: Number(d.amount), email: d.buyer?.email, status: d.status, holdExpiresAt: d.hold_expires_at, routeName: d.departures?.routes?.name ?? '',
          revolutOrderId: d.revolut_order_id, checkoutUrl: d.revolut_checkout_url };
      },
      async setRevolutOrder(id, orderId, checkoutUrl) {
        const { error } = await sb.from('bookings').update({ revolut_order_id: orderId, revolut_checkout_url: checkoutUrl }).eq('id', id);
        if (error) throw new Error(error.message);
      },
      async findByRevolutOrder(orderId) {
        const { data } = await sb.from('bookings').select('id').eq('revolut_order_id', orderId).maybeSingle();
        return (data as { id: string } | null)?.id ?? null;
      },
      async findByRef(ref) {
        const { data } = await sb.from('bookings').select('id').eq('ref', ref).maybeSingle();
        return (data as { id: string } | null)?.id ?? null;
      },
      async hasSentConfirmation(bookingId) {
        const { count } = await sb.from('email_log').select('id', { count: 'exact', head: true }).eq('booking_id', bookingId).eq('kind', 'confirmation').eq('status', 'sent');
        return (count ?? 0) > 0;
      },
      markPaid: (id, method, orderId) => rpc(sb, 'mark_paid', { p_booking: id, p_method: method, p_revolut_order: orderId }),
      documents: (id) => rpc<Documents>(sb, 'booking_documents', { p_booking: id }),
      async bookingIdsOfDeparture(departureId) {
        const { data } = await sb.from('bookings').select('id').eq('departure_id', departureId).in('status', ['paid', 'paid_overbooked']);
        return ((data ?? []) as { id: string }[]).map((r) => r.id);
      },
      async logEmail(e) {
        await sb.from('email_log').insert({ booking_id: e.bookingId, kind: e.kind, to_email: e.to, status: e.status, provider_id: e.providerId, error: e.error });
        if (e.status === 'sent' && (e.kind === 'invoice' || e.kind === 'credit_note')) {
          await sb.from('invoices').update({ sent_at: new Date().toISOString() }).eq('booking_id', e.bookingId).eq('kind', e.kind === 'invoice' ? 'invoice' : 'credit_note');
        }
      },
    },
    revolut: (o) => createRevolutOrder({ baseUrl: revolutBaseUrl(Deno.env.get('REVOLUT_ENV')), secretKey: env('REVOLUT_SECRET_KEY'), apiVersion: REVOLUT_API_VERSION }, o),
    send: (m) => sendEmail(env('RESEND_API_KEY'), { ...m, replyTo: Deno.env.get('MAIL_REPLY_TO') }),
    pdf: buildInvoicePdf,
    async inviteUser(email, role, displayName) {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: env('PUBLIC_BASE_URL') });
      if (error || !data.user) throw new Error(error?.message ?? 'Invite failed');
      const { error: e2 } = await sb.from('staff').upsert({ user_id: data.user.id, email, role, display_name: displayName || email, active: true });
      if (e2) throw new Error(e2.message);
    },
    env: {
      publicBaseUrl: env('PUBLIC_BASE_URL', 'https://domerome77.github.io/ljubljana-airport/GoOpti-brnik-nov24/'),
      mailFrom: env('MAIL_FROM', 'GoOpti Airport Transfers <tickets@example.com>'),
      webhookSecret: Deno.env.get('REVOLUT_WEBHOOK_SECRET') ?? '',
      now: () => Date.now(),
      holdMinutes: 15,
    },
  };
}

/** Role of the signed-in caller, from the Authorization bearer token. */
export async function callerRole(sb: SupabaseClient, authHeader: string | null): Promise<'admin' | 'desk' | null> {
  const jwt = authHeader?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await sb.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: row } = await sb.from('staff').select('role, active').eq('user_id', data.user.id).maybeSingle();
  const r = row as { role: 'admin' | 'desk'; active: boolean } | null;
  return r?.active ? r.role : null;
}
