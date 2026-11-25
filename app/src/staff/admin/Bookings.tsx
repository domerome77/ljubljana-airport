import { useState } from 'react';
import type { Api, BookingRow, DepartureAdminView } from '../../api/Api';
import { formatEur } from '../../domain/money';
import { addDaysYmd, formatLocal, localYmd, toUtcFromLocal } from '../../domain/time';
import type { BookingStatus } from '../../domain/types';
import { Modal } from '../Modal';
import { errMsg, useLoad } from '../useLoad';
import { bookingsToCsv, downloadCsv } from './exportCsv';

export function Bookings({ api, now }: { api: Api; now: () => string }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = { fromIso: from ? toUtcFromLocal(from, '00:00') : undefined, toIso: to ? toUtcFromLocal(addDaysYmd(to, 1), '00:00') : undefined };
  const list = useLoad(() => api.listBookings({ text, status: status || undefined, ...range }), [api, text, status, from, to]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [moving, setMoving] = useState<BookingRow | null>(null);

  async function act(fn: () => Promise<void>, ok: string) {
    try { await fn(); setMsg({ ok: true, text: ok }); await list.reload(); } catch (e) { setMsg({ ok: false, text: errMsg(e) }); }
  }
  async function cancel(b: BookingRow) {
    const paid = b.status === 'paid' || b.status === 'paid_overbooked';
    const text = paid
      ? `Cancel booking ${b.ref} for ${b.buyer.name}? This issues a credit note. Refund the money in Revolut Business.`
      : `Cancel booking ${b.ref}?`;
    if (!window.confirm(text)) return;
    await act(() => api.cancelBooking(b.id), `Booking ${b.ref} cancelled${paid ? ' — credit note issued' : ''}`);
  }
  async function exportCsv() {
    const [rows, settings] = await Promise.all([api.listBookings({ ...range }), api.getSettings()]);
    downloadCsv(`goopti-lju-bookings-${from || 'all'}-${to || localYmd(now())}.csv`, bookingsToCsv(rows, settings.vatRate));
  }

  return (
    <>
      <div className="page-head">
        <h1>Bookings</h1>
        <button type="button" className="btn btn-dark" onClick={() => void exportCsv()}>Export CSV for settlement</button>
      </div>
      <div className="panel toolbar" style={{ marginBottom: 16 }}>
        <label className="sinput" style={{ flex: '2 1 220px' }}><span>Search</span><input aria-label="Search" placeholder="Ref, name, email, company" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="sinput"><span>Status</span>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
            <option value="">All</option><option value="paid">Paid</option><option value="held">Held (paying)</option>
            <option value="paid_overbooked">Overbooked</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option>
          </select></label>
        <label className="sinput"><span>Departure from</span><input aria-label="Departure from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="sinput"><span>to</span><input aria-label="Departure to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-bad'}`} role="status">{msg.text}</p>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Booking</th><th>Passenger</th><th>Departure</th><th>Ride</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((b) => (
              <tr key={b.id}>
                <td><b className="conf-ref">{b.ref}</b><div className="muted">{b.channel} · {b.invoiceNumber ?? 'no invoice'}{b.creditNoteNumber ? ` · ${b.creditNoteNumber}` : ''}</div></td>
                <td>{b.buyer.name}<div className="muted">{b.buyer.email ?? '—'}{b.buyer.company ? ` · ${b.buyer.company.name}` : ''}</div></td>
                <td>{formatLocal(b.departsAt, 'datetime')}<div className="muted">{b.routeCode} · <span className="plate">{b.plate}</span></div></td>
                <td>{b.product} · {b.passengers}</td>
                <td className="tabular">{formatEur(b.amount)}<div className="muted">{b.paymentMethod ?? ''}</div></td>
                <td><span className={`pill ${b.status}`}>{b.status === 'paid_overbooked' ? 'overbooked' : b.status}</span></td>
                <td>
                  <div className="row-actions">
                    {(b.status === 'paid' || b.status === 'paid_overbooked') && <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoving(b)}>Move</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act(() => api.resendEmails(b.id), `Emails re-sent for ${b.ref}`)}>Resend</button>
                    </>}
                    {b.status !== 'cancelled' && b.status !== 'expired' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancel(b)}>Cancel</button>}
                  </div>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && <tr><td colSpan={7} className="muted">No bookings found.</td></tr>}
          </tbody>
        </table>
      </div>
      {moving && <MoveDialog api={api} booking={moving} onClose={() => setMoving(null)}
        onMoved={() => { setMoving(null); setMsg({ ok: true, text: `Booking ${moving.ref} moved — passenger notified` }); void list.reload(); }} />}
    </>
  );
}

function MoveDialog({ api, booking, onClose, onMoved }: { api: Api; booking: BookingRow; onClose: () => void; onMoved: () => void }) {
  const day = localYmd(booking.departsAt);
  const options = useLoad(() => api.listDeparturesAdmin(toUtcFromLocal(addDaysYmd(day, -1), '00:00'), toUtcFromLocal(addDaysYmd(day, 3), '00:00')), [api, day]);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fits = (d: DepartureAdminView) => d.id !== booking.departureId && d.routeCode === booking.routeCode && d.status === 'scheduled';
  return (
    <Modal title={`Move ${booking.ref}`} onClose={onClose}>
      <div className="form-stack">
        <p>{booking.buyer.name} · {booking.passengers} {booking.product === 'private' ? 'people (private)' : 'seats'}. The passenger gets an updated ticket by email.</p>
        <label className="sinput"><span>New departure</span>
          <select aria-label="New departure" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {(options.data ?? []).filter(fits).map((d) => (
              <option key={d.id} value={d.id}>{formatLocal(d.departsAt, 'datetime')} · {d.plate} · {d.seatsLeft} free</option>
            ))}
          </select></label>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={!target}
            onClick={() => void api.moveBooking(booking.id, target).then(onMoved).catch((e) => setError(errMsg(e)))}>Move booking</button>
        </div>
      </div>
    </Modal>
  );
}
