import { useState, type FormEvent } from 'react';
import { ApiError, type HoldResult, type PublicApi } from '../api/Api';
import { formatEur } from '../domain/money';
import type { Buyer, Product, Quote } from '../domain/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CheckoutFormProps {
  api: PublicApi; departureId: string; product: Product; passengers: number; quote: Quote | null;
  onRefresh: () => void; redirect?: (url: string) => void;
}

const MESSAGES: Partial<Record<string, string>> = {
  SOLD_OUT: 'Those seats were just taken — please pick another departure',
  SALES_CLOSED: 'Sales for this departure have just closed — please pick another departure',
};

export function CheckoutForm({ api, departureId, product, passengers, quote, onRefresh, redirect = (u) => window.location.assign(u) }: CheckoutFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [wantsCompany, setWantsCompany] = useState(false);
  const [company, setCompany] = useState({ name: '', address: '', vatId: '' });
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<HoldResult | null>(null);

  const amount = held?.amount ?? quote?.amount ?? null;
  const priceChanged = held !== null && quote !== null && held.amount !== quote.amount;

  function validate(): string | null {
    if (!name.trim()) return 'Name is required';
    if (!email.trim()) return 'Email is required';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email';
    if (wantsCompany && (!company.name.trim() || !company.address.trim() || !company.vatId.trim())) {
      return 'Company name, address and VAT ID are required';
    }
    if (!terms) return 'Please accept the terms of carriage';
    return null;
  }

  async function goToPayment(h: HoldResult) {
    const { checkoutUrl } = await api.startCheckout(h.bookingId, h.token);
    redirect(checkoutUrl);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      if (held) { await goToPayment(held); return; }
      const buyer: Buyer = { name: name.trim(), email: email.trim() };
      if (phone.trim()) buyer.phone = phone.trim();
      if (wantsCompany) buyer.company = { name: company.name.trim(), address: company.address.trim(), vatId: company.vatId.trim() };
      const h = await api.hold({ departureId, product, passengers, buyer, channel: 'web' });
      setHeld(h);
      if (quote && h.amount !== quote.amount) { setBusy(false); return; }
      await goToPayment(h);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'NETWORK';
      setError(MESSAGES[code] ?? (err instanceof ApiError && err.message !== code ? err.message : 'Something went wrong. Please try again.'));
      if (code === 'SOLD_OUT' || code === 'SALES_CLOSED') { setHeld(null); onRefresh(); }
      setBusy(false);
    }
  }

  return (
    <form className="checkout" onSubmit={onSubmit} noValidate>
      <h2 className="checkout-title">Your details</h2>
      <div className="form-grid">
        <label className="input"><span>Full name</span>
          <input aria-label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="input"><span>Email</span>
          <input aria-label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <small>Your ticket and invoice are sent here.</small>
        </label>
        <label className="input"><span>Phone <em>(optional)</em></span>
          <input aria-label="Phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" aria-label="Invoice to a company" checked={wantsCompany} onChange={(e) => setWantsCompany(e.target.checked)} />
        <span>Invoice to a company</span>
      </label>
      {wantsCompany && (
        <div className="form-grid">
          <label className="input"><span>Company name</span>
            <input aria-label="Company name" autoComplete="organization" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
          </label>
          <label className="input"><span>Company address</span>
            <input aria-label="Company address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
          </label>
          <label className="input"><span>VAT ID</span>
            <input aria-label="VAT ID" value={company.vatId} onChange={(e) => setCompany({ ...company, vatId: e.target.value })} />
          </label>
        </div>
      )}
      <label className="check">
        <input type="checkbox" aria-label="I accept the terms of carriage" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>I accept the terms of carriage. Tickets are valid only for the selected departure.</span>
      </label>
      {priceChanged && <p className="notice notice-warn" role="status">Price updated to {formatEur(held!.amount)}</p>}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || amount === null}>
        {busy ? 'Reserving your seats…' : `Pay ${amount !== null ? formatEur(amount) : ''} with Revolut`}
      </button>
      <p className="secure">Seats are held for 15 minutes while you pay · Card, Apple Pay, Google Pay via Revolut</p>
    </form>
  );
}
