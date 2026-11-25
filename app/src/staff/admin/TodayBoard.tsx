import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Api } from '../../api/Api';
import { formatEur } from '../../domain/money';
import { addDaysYmd, formatLocal, localYmd, toUtcFromLocal } from '../../domain/time';
import { useLoad } from '../useLoad';
import { SeatBar, SeatLegend, seatStats } from './SeatBar';

export function dayRange(ymd: string): [string, string] {
  return [toUtcFromLocal(ymd, '00:00'), toUtcFromLocal(addDaysYmd(ymd, 1), '00:00')];
}

export function TodayBoard({ api, now, linkBase = '/admin' }: { api: Api; now: () => string; linkBase?: string }) {
  const [day, setDay] = useState(localYmd(now()));
  const { data, error } = useLoad(() => api.listDeparturesAdmin(...dayRange(day)), [api, day]);
  const list = data ?? [];
  const problems = list.filter((d) => d.problems.length > 0);
  const sorted = [...problems, ...list.filter((d) => d.problems.length === 0)];
  const revenue = list.reduce((s, d) => s + d.revenue, 0);
  const sold = list.reduce((s, d) => s + d.soldSeats, 0);
  return (
    <>
      <div className="page-head">
        <h1>{day === localYmd(now()) ? 'Today' : formatLocal(toUtcFromLocal(day, '12:00'), 'date')}</h1>
        <div className="toolbar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(addDaysYmd(day, -1))}>← Previous day</button>
          <label className="sinput"><span className="sr-only">Day</span><input aria-label="Day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(addDaysYmd(day, 1))}>Next day →</button>
        </div>
      </div>
      <p className="board-stats">{list.length} departures · {sold} seats sold · {formatEur(revenue)} revenue</p>
      <SeatLegend />
      {error && <p className="notice notice-bad">{error}</p>}
      {list.length === 0 ? (
        <div className="empty-light">No departures on this day. <Link to={`${linkBase}/departures`}>Add departures</Link></div>
      ) : (
        <div className="board">
          {sorted.map((d) => (
            <Link key={d.id} to={`${linkBase}/manifest/${d.id}`} data-testid={`board-${d.id}`}
              className={`board-card${d.problems.length ? ' problem' : ''}${d.status === 'cancelled' ? ' cancelled' : ''}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="board-top">
                <span className="board-time">{formatLocal(d.departsAt, 'time')}</span>
                <span className="plate">{d.plate}</span>
              </div>
              <div className="board-route">{d.routeCode === 'LJU-BLED' ? 'LJU → Bled' : 'LJU → Ljubljana'} · {d.vehicleName}{d.status === 'cancelled' && ' · CANCELLED'}</div>
              <SeatBar d={d} />
              <div className="board-stats">{seatStats(d)} · {formatEur(d.revenue)}</div>
              {d.blockedNote && d.blockedSeats > 0 && <div className="board-stats">Blocked: {d.blockedNote}</div>}
              {d.problems.map((p) => <div key={p} className="notice notice-bad">{p}</div>)}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
