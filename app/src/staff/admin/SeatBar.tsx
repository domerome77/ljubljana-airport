import type { DepartureAdminView } from '../../api/Api';

export function seatStats(d: DepartureAdminView): string {
  return `sold ${d.soldSeats} · held ${d.heldSeats} · blocked ${d.blockedSeats} · free ${d.seatsLeft}`;
}

export function SeatBar({ d }: { d: DepartureAdminView }) {
  const pct = (n: number) => `${(n / Math.max(1, d.capacity)) * 100}%`;
  return (
    <div className="seatbar" role="img" aria-label={seatStats(d)}>
      <span className="s-sold" style={{ width: pct(d.soldSeats) }} />
      <span className="s-held" style={{ width: pct(d.heldSeats) }} />
      <span className="s-blocked" style={{ width: pct(d.blockedSeats) }} />
    </div>
  );
}

export function SeatLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--pink)' }} />sold</span>
      <span><i style={{ background: '#ffb547' }} />held (paying now)</span>
      <span><i style={{ background: '#8a94a3' }} />blocked (sold elsewhere)</span>
      <span><i style={{ background: 'var(--line-2)' }} />free</span>
    </div>
  );
}
