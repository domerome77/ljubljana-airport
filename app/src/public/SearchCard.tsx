import type { ReactNode } from 'react';
import { formatEur } from '../domain/money';
import type { Product, RouteCode } from '../domain/types';
import { DepartureList } from './DepartureList';
import type { BookingSearch } from './useBookingSearch';

export const ROUTE_OPTIONS: { code: RouteCode; label: string }[] = [
  { code: 'LJU-LJ', label: 'Ljubljana — any address' },
  { code: 'LJU-BLED', label: 'Bled — any address' },
];

interface Props { search: BookingSearch; now: string; maxPassengers?: number; children?: ReactNode; emptyHint?: ReactNode }

export function SearchFields({ search, maxPassengers = 8 }: { search: BookingSearch; maxPassengers?: number }) {
  const { route, setRoute, product, setProduct, passengers, setPassengers } = search;
  return (
    <>
      <div className="fields">
        <div className="field field-from">
          <span className="field-label">From</span>
          <span className="field-value">Ljubljana Airport (LJU)</span>
        </div>
        <label className="field">
          <span className="field-label">To</span>
          <select aria-label="To" value={route} onChange={(e) => setRoute(e.target.value as RouteCode)}>
            {ROUTE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Passengers</span>
          <select aria-label="Passengers" value={String(passengers)} onChange={(e) => setPassengers(Number(e.target.value))}>
            {Array.from({ length: maxPassengers }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n === 1 ? '1 person' : `${n} people`}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="segmented">
        <legend>Type of ride</legend>
        {([['shared', 'Shared', 'Pay per seat'], ['private', 'Private', 'Whole van for you']] as [Product, string, string][]).map(([p, title, desc]) => (
          <label key={p}>
            <input type="radio" name="product" value={p} aria-label={title} checked={product === p} onChange={() => setProduct(p)} />
            <span className="seg-title">{title}</span>
            <span className="seg-desc">{desc}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function PriceSummary({ search }: { search: BookingSearch }) {
  const { quote } = search;
  return (
    <section aria-label="Price" className="summary" aria-live="polite">
      <div>
        <ul className="summary-lines">
          {quote?.lines.map((l) => (
            <li key={l.label}><span>{l.label}</span><span className="tabular">{formatEur(l.amount)}</span></li>
          ))}
        </ul>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="summary-total-label">Total · one way</div>
        <div className="summary-total tabular" data-testid="total">{quote ? formatEur(quote.amount) : '—'}</div>
      </div>
    </section>
  );
}

export function SearchCard({ search, now, maxPassengers, children, emptyHint }: Props) {
  const { departures, product, passengers, selectedId, setSelectedId, loading, error } = search;
  const hasAny = departures.some((d) => (product === 'private' ? d.privatePrice !== null : d.sharedFromPrice !== null));
  return (
    <>
      <SearchFields search={search} maxPassengers={maxPassengers} />
      <div>
        <div className="deps-head">
          <h2>Departures from the airport</h2>
          <span className="hint">Ljubljana local time</span>
        </div>
        {error && <p className="notice notice-bad">{error}</p>}
        {!loading && !hasAny ? (
          <div className="empty" style={{ marginTop: 10 }}>
            <strong>No vans on sale right now</strong>
            {emptyHint ?? 'Please ask at the GoOpti desk in the arrivals hall, or check again a little later.'}
          </div>
        ) : (
          <DepartureList departures={departures} product={product} passengers={passengers} selectedId={selectedId} onSelect={setSelectedId} now={now} />
        )}
      </div>
      {selectedId && <PriceSummary search={search} />}
      {children}
    </>
  );
}
