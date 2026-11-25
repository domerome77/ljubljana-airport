import { useCallback, useEffect, useState } from 'react';
import { ApiError, type PublicApi, type PublicBookingView } from '../api/Api';
import { formatEur } from '../domain/money';
import { Confirmation } from './Confirmation';

type DemoApi = PublicApi & { confirmPayment?: (id: string) => void; failPayment?: (id: string) => void };

export interface BookingResultProps { api: DemoApi; id: string; token: string; demo: boolean; pollMs?: number; maxWaitMs?: number }

export function BookingResult({ api, id, token, demo, pollMs = 3000, maxWaitMs = 120_000 }: BookingResultProps) {
  const [b, setB] = useState<PublicBookingView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [started] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setB(await api.getBooking(id, token));
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'NOT_FOUND' ? 'Booking not found. Please check the link in your email.' : 'Could not load your booking. Retrying…');
    }
  }, [api, id, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!b || b.status !== 'held' || demo) return;
    if (Date.now() - started > maxWaitMs) return;
    const t = setTimeout(() => void load(), pollMs);
    return () => clearTimeout(t);
  }, [b, demo, load, pollMs, maxWaitMs, started]);

  let body;
  if (!b) {
    body = <p className={err ? 'notice notice-bad' : ''}>{err ?? 'Loading your booking…'}</p>;
  } else if (b.status === 'paid' || b.status === 'paid_overbooked') {
    body = (
      <>
        <div className="result-ok no-print">
          <h1>You're booked!</h1>
          <p>We've emailed your ticket and, separately, your invoice. Show this ticket to the driver.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print ticket</button>
        </div>
        <Confirmation booking={b} />
      </>
    );
  } else if (b.status === 'held') {
    body = demo && api.confirmPayment ? (
      <div className="demo-pay">
        <div className="demo-pay-kicker">Revolut checkout · demo simulation</div>
        <h1>{formatEur(b.amount)}</h1>
        <p>{b.routeName} · booking {b.ref}</p>
        <div className="demo-pay-actions">
          <button type="button" className="btn btn-primary" onClick={() => { api.confirmPayment!(id); void load(); }}>Pay {formatEur(b.amount)} (test)</button>
          <button type="button" className="btn btn-ghost" onClick={() => { api.failPayment?.(id); void load(); }}>Cancel payment</button>
        </div>
        <p className="muted">In the live app this step is Revolut's secure payment page.</p>
      </div>
    ) : (
      <div className="result-wait" role="status">
        <span className="spinner" aria-hidden="true" />
        <h1>Confirming your payment…</h1>
        <p>This usually takes a few seconds. Your ticket will also arrive by email.</p>
      </div>
    );
  } else {
    body = (
      <div className="result-fail">
        <h1>Payment not completed — your seats were released</h1>
        <p>No money was taken for this booking. You can choose a departure again.</p>
        <a className="btn btn-primary" href="#/">Back to departures</a>
      </div>
    );
  }
  return <main className="result-page"><div className="result-inner">{body}</div></main>;
}
