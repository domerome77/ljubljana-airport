import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Api, DepartureAdminView } from '../../api/Api';
import { addDaysYmd, formatLocal, localYmd, toUtcFromLocal } from '../../domain/time';
import { Modal } from '../Modal';
import { errMsg, useLoad } from '../useLoad';
import { DepartureForm } from './DepartureForm';
import { RepeatDialog } from './RepeatDialog';
import { seatStats } from './SeatBar';
import { dayRange } from './TodayBoard';

export function Departures({ api, now }: { api: Api; now: () => string }) {
  const [day, setDay] = useState(localYmd(now()));
  const deps = useLoad(() => api.listDeparturesAdmin(...dayRange(day)), [api, day]);
  const meta = useLoad(async () => ({ routes: await api.listRoutes(), vehicles: await api.listVehicles(), settings: await api.getSettings() }), [api]);
  const [edit, setEdit] = useState<DepartureAdminView | 'new' | null>(null);
  const [repeat, setRepeat] = useState<DepartureAdminView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(d: DepartureAdminView) {
    if (!window.confirm(`Cancel the ${formatLocal(d.departsAt, 'time')} departure? It will disappear from sale.`)) return;
    try { await api.cancelDeparture(d.id); setError(null); await deps.reload(); } catch (e) { setError(errMsg(e)); }
  }

  return (
    <>
      <div className="page-head">
        <h1>Departures</h1>
        <div className="toolbar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(addDaysYmd(day, -1))}>←</button>
          <label className="sinput"><span className="sr-only">Day</span><input aria-label="Day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(addDaysYmd(day, 1))}>→</button>
          <button type="button" className="btn btn-primary" onClick={() => setEdit('new')} disabled={!meta.data}>Add departure</button>
        </div>
      </div>
      <p className="muted">{formatLocal(toUtcFromLocal(day, '12:00'), 'date')} · times are Ljubljana local time. Use <b>Repeat</b> to copy a departure to other days.</p>
      {(error || deps.error) && <p className="notice notice-bad" role="alert">{error ?? deps.error}</p>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Time</th><th>Route</th><th>Vehicle</th><th>Seats</th><th>Sells</th><th /></tr></thead>
          <tbody>
            {(deps.data ?? []).map((d) => (
              <tr key={d.id} data-testid={`dep-${d.id}`} style={d.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                <td><b className="tabular" style={{ fontSize: 20 }}>{formatLocal(d.departsAt, 'time')}</b>{d.status === 'cancelled' && <div className="pill">cancelled</div>}</td>
                <td>{d.routeCode === 'LJU-BLED' ? 'LJU → Bled' : 'LJU → Ljubljana'}</td>
                <td><span className="plate">{d.plate}</span> <span className="muted">{d.vehicleName}</span></td>
                <td className="tabular">{seatStats(d)}</td>
                <td>{[d.sellShared && 'shared', d.sellPrivate && 'private'].filter(Boolean).join(' + ')} · closes {d.salesCloseMinutes} min before</td>
                <td>
                  <div className="row-actions">
                    {d.status === 'scheduled' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(d)}>Edit</button>}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRepeat(d)}>Repeat</button>
                    <Link className="btn btn-ghost btn-sm" to={`/admin/manifest/${d.id}`}>Passengers</Link>
                    {d.status === 'scheduled' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancel(d)}>Cancel departure</button>}
                  </div>
                </td>
              </tr>
            ))}
            {deps.data?.length === 0 && <tr><td colSpan={6} className="muted">No departures on this day.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && meta.data && (
        <Modal title={edit === 'new' ? 'Add departure' : 'Edit departure'} onClose={() => setEdit(null)}>
          <DepartureForm api={api} {...meta.data} existing={edit === 'new' ? null : edit} defaultDay={day}
            onCancel={() => setEdit(null)}
            onSaved={(d) => { setEdit(null); const dd = localYmd(d.departsAt); if (dd !== day) setDay(dd); else void deps.reload(); }} />
        </Modal>
      )}
      {repeat && (
        <Modal title="Repeat departure" onClose={() => { setRepeat(null); void deps.reload(); }}>
          <RepeatDialog api={api} dep={repeat} onDone={() => void deps.reload()} />
        </Modal>
      )}
    </>
  );
}
