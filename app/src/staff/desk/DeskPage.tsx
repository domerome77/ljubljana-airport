import { useEffect, useState, type FormEvent } from 'react';
import type { Api, PublicBookingView } from '../../api/Api';
import { formatEur } from '../../domain/money';
import type { Buyer } from '../../domain/types';
import { Confirmation } from '../../public/Confirmation';
import { PriceSummary, SearchCard } from '../../public/SearchCard';
import { useBookingSearch } from '../../public/useBookingSearch';
import '../../styles/landing.css';
import { StaffHeader } from '../admin/AdminApp';
import { TodayBoard } from '../admin/TodayBoard';
import { RequireRole } from '../RequireRole';
import { errMsg } from '../useLoad';

const THERMAL_KEY = 'goopti-desk-thermal';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readThermal(): boolean {
  try { return window.localStorage.getItem(THERMAL_KEY) === '1'; } catch { return false; }
}

function DeskSell({ api, now }: { api: Api; now: () => string }) {
  const search = useBookingSearch(api, 15_000);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'desk_card' | 'desk_cash'>('desk_card');
  const [wantsCompany, setWantsCompany] = useState(false);
  const [company, setCompany] = useState({ name: '', address: '', vatId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<PublicBookingView | null>(null);
  const [thermal, setThermal] = useState(readThermal);

  useEffect(() => {
    document.body.classList.toggle('thermal', thermal);
    return () => document.body.classList.remove('thermal');
  }, [thermal]);
  useEffect(() => {
    if (!ticket) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [ticket]);

  function toggleThermal(v: boolean) {
    setThermal(v);
    try { window.localStorage.setItem(THERMAL_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!search.selectedId) { setError('Choose a departure'); return; }
    if (!name.trim()) { setError('Passenger name is required'); return; }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setError('Enter a valid email or leave it empty'); return; }
    if (wantsCompany && (!company.name.trim() || !company.address.trim() || !company.vatId.trim())) { setError('Company name, address and VAT ID are required'); return; }
    const buyer: Buyer = { name: name.trim() };
    if (email.trim()) buyer.email = email.trim();
    if (phone.trim()) buyer.phone = phone.trim();
    if (wantsCompany) buyer.company = { ...company };
    setBusy(true);
    try {
      const r = await api.deskBook({ departureId: search.selectedId, product: search.product, passengers: search.passengers, buyer, channel: 'desk', paymentMethod: method, expectedAmount: search.quote?.amount });
      setTicket(await api.getBooking(r.bookingId, r.token));
      void search.refresh();
    } catch (err) {
      setError(errMsg(err));
      void search.refresh();
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTicket(null); setName(''); setEmail(''); setPhone(''); setWantsCompany(false); setCompany({ name: '', address: '', vatId: '' });
  }

  return (
    <div className="desk-grid">
      <div className="desk-card">
        <h2>1 · Choose the ride</h2>
        <SearchCard search={search} now={now()} maxPassengers={20} emptyHint="Nothing on sale. Check the Today board or ask the admin to add a departure." />
      </div>
      <div className="desk-card">
        {ticket ? (
          <div className="desk-done">
            <h2>Booked · {ticket.ref}</h2>
            <p className="notice notice-ok no-print">Paid {formatEur(ticket.amount)} · {method === 'desk_cash' ? 'cash' : 'card'}. Hand the printed ticket to the passenger.</p>
            <Confirmation booking={ticket} variant="print" />
            <div className="step-actions no-print">
              <button type="button" className="btn btn-ghost" style={{ color: '#fff' }} onClick={() => window.print()}>Print again</button>
              <button type="button" className="btn btn-primary" onClick={reset}>New booking</button>
            </div>
          </div>
        ) : (
          <form className="checkout" style={{ borderTop: 0, paddingTop: 0 }} onSubmit={submit} noValidate>
            <h2>2 · Passenger &amp; payment</h2>
            <div className="form-grid">
              <label className="input"><span>Passenger name</span><input aria-label="Passenger name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="input"><span>Email <em>(optional — ticket &amp; invoice by email)</em></span><input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="input"><span>Phone <em>(optional)</em></span><input aria-label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            </div>
            <label className="check"><input type="checkbox" aria-label="Invoice to a company" checked={wantsCompany} onChange={(e) => setWantsCompany(e.target.checked)} /><span>Invoice to a company</span></label>
            {wantsCompany && (
              <div className="form-grid">
                <label className="input"><span>Company name</span><input aria-label="Company name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></label>
                <label className="input"><span>Company address</span><input aria-label="Company address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></label>
                <label className="input"><span>VAT ID</span><input aria-label="VAT ID" value={company.vatId} onChange={(e) => setCompany({ ...company, vatId: e.target.value })} /></label>
              </div>
            )}
            <fieldset className="segmented">
              <legend>Payment</legend>
              <label><input type="radio" name="pay" aria-label="Card terminal" checked={method === 'desk_card'} onChange={() => setMethod('desk_card')} /><span className="seg-title">Card terminal</span><span className="seg-desc">Paid on the desk terminal</span></label>
              <label><input type="radio" name="pay" aria-label="Cash" checked={method === 'desk_cash'} onChange={() => setMethod('desk_cash')} /><span className="seg-title">Cash</span><span className="seg-desc">Paid in cash</span></label>
            </fieldset>
            {search.selectedId && <PriceSummary search={search} />}
            <label className="check"><input type="checkbox" aria-label="Thermal printer (80 mm)" checked={thermal} onChange={(e) => toggleThermal(e.target.checked)} /><span>Thermal printer (80 mm)</span></label>
            {error && <p className="notice notice-bad" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Booking…' : `Confirm & print${search.quote ? ` · ${formatEur(search.quote.amount)}` : ''}`}
            </button>
            <p className="secure">Take the payment first, then confirm. The seats are sold from the same pool as the website.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export function DeskPage({ api, now }: { api: Api; now: () => string }) {
  const [tab, setTab] = useState<'sell' | 'today'>('sell');
  return (
    <RequireRole api={api} roles={['desk', 'admin']}>
      {(user, signOut) => (
        <div className="staff">
          <StaffHeader title="Desk" user={user.displayName} onSignOut={signOut}
            tabs={user.role === 'admin' ? [['/admin', 'Admin'] as const] : []}
            extra={<span className="tab-toggle">
              <button type="button" aria-pressed={tab === 'sell'} onClick={() => setTab('sell')}>Sell</button>
              <button type="button" aria-pressed={tab === 'today'} onClick={() => setTab('today')}>Today</button>
            </span>} />
          <main className="wrap staff-main">
            {tab === 'sell' ? <DeskSell api={api} now={now} /> : <TodayBoard api={api} now={now} linkBase={user.role === 'admin' ? '/admin' : null} />}
          </main>
        </div>
      )}
    </RequireRole>
  );
}
