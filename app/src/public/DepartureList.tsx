import { useState } from 'react';
import { formatEurShort } from '../domain/money';
import { dayLabel, formatLocal } from '../domain/time';
import type { Product, PublicDeparture } from '../domain/types';
import { relativeIn, seatsText } from './format';

export interface DepartureListProps {
  departures: PublicDeparture[];
  product: Product;
  passengers: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: string;
  initialVisible?: number;
}

/** A departure can take the request? */
export function fits(d: PublicDeparture, product: Product, passengers: number): boolean {
  if (product === 'private') return d.privatePrice !== null && passengers <= d.capacity;
  return d.sharedFromPrice !== null && passengers <= d.seatsLeft;
}

export function visibleFor(departures: PublicDeparture[], product: Product): PublicDeparture[] {
  return departures.filter((d) => (product === 'private' ? d.privatePrice !== null : d.sharedFromPrice !== null));
}

export function DepartureList({ departures, product, passengers, selectedId, onSelect, now, initialVisible = 6 }: DepartureListProps) {
  const [showAll, setShowAll] = useState(false);
  const list = visibleFor(departures, product);
  const shown = showAll ? list : list.slice(0, initialVisible);
  const groups: { label: string; items: PublicDeparture[] }[] = [];
  for (const d of shown) {
    const label = dayLabel(d.departsAt, now);
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(d);
    else groups.push({ label, items: [d] });
  }
  return (
    <div>
      {groups.map((g) => (
        <div className="day-group" key={g.label}>
          <h3>{g.label}</h3>
          <div className="dep-list">
            {g.items.map((d, i) => {
              const ok = fits(d, product, passengers);
              const rel = relativeIn(d.departsAt, now);
              const isFirst = d.id === list[0]?.id && i === 0;
              return (
                <button key={d.id} type="button" className="dep" aria-pressed={d.id === selectedId} disabled={!ok} onClick={() => onSelect(d.id)}>
                  <span className="dep-time">{formatLocal(d.departsAt, 'time')}</span>
                  <span className="dep-meta">
                    {isFirst && <span className="dep-badge">Next van</span>}
                    {rel && <span>{rel}</span>}
                    {product === 'shared' ? (
                      <span className={`dep-seats${d.seatsLeft <= 3 ? ' low' : ''}`}>
                        {ok ? seatsText(d.seatsLeft) : `Only ${seatsText(d.seatsLeft).replace(' left', '')} left`}
                      </span>
                    ) : (
                      <span className="dep-seats">{`whole van · up to ${d.capacity} people · ${formatEurShort(d.privatePrice!)}`}</span>
                    )}
                  </span>
                  <span className="dep-price">
                    {product === 'shared' ? `from ${formatEurShort(d.sharedFromPrice!)}` : formatEurShort(d.privatePrice!)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {list.length > shown.length && (
        <button type="button" className="link-btn" style={{ color: '#fff', marginTop: 12 }} onClick={() => setShowAll(true)}>
          Show all {list.length} departures
        </button>
      )}
    </div>
  );
}
