import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { PublicBookingView } from '../api/Api';
import { formatEur } from '../domain/money';
import { formatLocal } from '../domain/time';
import '../styles/confirmation.css';

const city = (b: PublicBookingView) => (b.routeCode === 'LJU-BLED' ? 'Bled' : 'Ljubljana');
const assetUrl = (u: string) => (/^(https?:|data:|\/)/.test(u) ? u : `${import.meta.env.BASE_URL}${u}`);

export function Confirmation({ booking, variant = 'screen' }: { booking: PublicBookingView; variant?: 'screen' | 'print' }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(booking.ref, { margin: 1, width: 240 }).then((u) => { if (alive) setQr(u); }).catch(() => setQr(null));
    return () => { alive = false; };
  }, [booking.ref]);
  return (
    <article className={`confirmation ${variant}`} aria-label="Your ticket">
      <header className="conf-head">
        <div>
          <div className="conf-kicker">GoOpti airport transfer · ticket</div>
          <h2 className="conf-route">{booking.routeName}</h2>
          <div className="conf-when">{formatLocal(booking.departsAt, 'date')} · <strong>{formatLocal(booking.departsAt, 'time')}</strong> <span>local time</span></div>
        </div>
        {qr && <img className="conf-qr" src={qr} alt={`QR code for booking ${booking.ref}`} />}
      </header>
      <div className="conf-plate-box">
        <span>Your van</span>
        <strong className="conf-plate">{booking.plate}</strong>
      </div>
      <dl className="conf-grid">
        <div><dt>Booking</dt><dd className="conf-ref">{booking.ref}</dd></div>
        <div><dt>Passenger</dt><dd>{booking.buyerName}</dd></div>
        <div><dt>Ride</dt><dd>{booking.product === 'private' ? 'Private van' : 'Shared'} · {booking.passengers} {booking.passengers === 1 ? 'person' : 'people'}</dd></div>
        <div><dt>Paid</dt><dd>{formatEur(booking.amount)}</dd></div>
      </dl>
      <p className="conf-address">Tell your driver your address in {city(booking)} when you board.</p>
      <figure className="conf-map">
        <img src={assetUrl(booking.meetingPoint.imageUrl)} alt="Map of Ljubljana Airport: from arrivals past the GoOpti info desk, across the road to GoOpti shuttle points 1–2" />
        <figcaption><strong>Where to find the van:</strong> {booking.meetingPoint.text}</figcaption>
      </figure>
      <p className="conf-foot">Please be at the van 5 minutes before departure. Questions? {booking.supportPhone}</p>
    </article>
  );
}
