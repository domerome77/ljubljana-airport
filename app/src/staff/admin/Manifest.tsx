import { useParams } from 'react-router-dom';
import type { Api } from '../../api/Api';
import { formatEur } from '../../domain/money';
import { formatLocal } from '../../domain/time';
import { useLoad } from '../useLoad';
import { SeatBar, seatStats } from './SeatBar';

export function Manifest({ api }: { api: Api }) {
  const { id = '' } = useParams();
  const { data, error } = useLoad(() => api.manifest(id), [api, id]);
  if (error) return <p className="notice notice-bad">{error}</p>;
  if (!data) return <p>Loading…</p>;
  const { departure: d, bookings } = data;
  return (
    <div className="manifest-print">
      <div className="page-head">
        <h1>{formatLocal(d.departsAt, 'datetime')} · {d.routeCode === 'LJU-BLED' ? 'LJU → Bled' : 'LJU → Ljubljana'}</h1>
        <button type="button" className="btn btn-dark no-print" onClick={() => window.print()}>Print passenger list</button>
      </div>
      <p><span className="plate">{d.plate}</span> {d.vehicleName} · {seatStats(d)}{d.blockedNote ? ` (${d.blockedNote})` : ''}</p>
      <SeatBar d={d} />
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data">
          <thead><tr><th>✓</th><th>Booking</th><th>Passenger</th><th>Seats</th><th>Phone</th><th>Paid</th></tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td><span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid #333', borderRadius: 3 }} /></td>
                <td className="conf-ref">{b.ref}</td>
                <td>{b.buyer.name}</td>
                <td>{b.product === 'private' ? `private · ${b.passengers} people` : b.passengers}</td>
                <td>{b.buyer.phone ?? '—'}</td>
                <td>{formatEur(b.amount)} · {b.channel}</td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={6} className="muted">No passengers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
