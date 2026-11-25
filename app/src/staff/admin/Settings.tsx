import { useEffect, useState, type FormEvent } from 'react';
import type { Api } from '../../api/Api';
import type { PriceTier, RouteCode, Settings } from '../../domain/types';
import { errMsg, useLoad } from '../useLoad';

const ROUTES: [RouteCode, string][] = [['LJU-LJ', 'LJU → Ljubljana'], ['LJU-BLED', 'LJU → Bled']];

function Num({ label, value, onChange, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <label className="sinput"><span>{label}</span>
      <input aria-label={label} type="number" step={step} value={Number.isNaN(value) ? '' : value} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Text({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return <label className="sinput"><span>{label}</span><input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

export function SettingsPage({ api }: { api: Api }) {
  const { data } = useLoad(() => api.getSettings(), [api]);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return <p>Loading…</p>;
  const set = (patch: Partial<Settings>) => { setMsg(null); setS({ ...s, ...patch }); };
  const setTier = (r: RouteCode, tiers: PriceTier[]) => set({ tierTemplate: { ...s.tierTemplate, [r]: tiers } });

  async function save(e: FormEvent) {
    e.preventDefault();
    try { await api.saveSettings(s!); setMsg({ ok: true, text: 'Settings saved' }); } catch (err) { setMsg({ ok: false, text: errMsg(err) }); }
  }

  return (
    <form className="form-stack" onSubmit={save}>
      <div className="page-head"><h1>Prices &amp; settings</h1><button className="btn btn-primary">Save settings</button></div>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-bad'}`} role="status">{msg.text}</p>}
      <section className="panel form-stack">
        <h2 style={{ margin: 0 }}>Default prices per route</h2>
        <p className="muted" style={{ margin: 0 }}>Used when creating new departures. Existing departures keep their own prices.</p>
        {ROUTES.map(([r, name]) => (
          <div key={r} className="form-section form-stack">
            <h3>{name}</h3>
            <div className="grid-3">
              <Num label={`${name} seat price (beyond tiers)`} value={s.defaultSeatPrice[r]} step={0.5} onChange={(n) => set({ defaultSeatPrice: { ...s.defaultSeatPrice, [r]: n } })} />
              <Num label={`${name} private van price`} value={s.defaultPrivatePrice[r]} step={1} onChange={(n) => set({ defaultPrivatePrice: { ...s.defaultPrivatePrice, [r]: n } })} />
            </div>
            {s.tierTemplate[r].map((t, i) => (
              <div className="tier-row" key={i}>
                <Num label={`${name} tier ${i + 1} seats`} value={t.seatCount} onChange={(n) => setTier(r, s.tierTemplate[r].map((x, j) => (j === i ? { ...x, seatCount: n } : x)))} />
                <Num label={`${name} tier ${i + 1} price`} value={t.pricePerSeat} step={0.5} onChange={(n) => setTier(r, s.tierTemplate[r].map((x, j) => (j === i ? { ...x, pricePerSeat: n } : x)))} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTier(r, s.tierTemplate[r].filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setTier(r, [...s.tierTemplate[r], { seatCount: 3, pricePerSeat: s.defaultSeatPrice[r] }])}>+ Add tier</button></div>
          </div>
        ))}
      </section>
      <section className="panel form-stack">
        <h2 style={{ margin: 0 }}>Price limits &amp; group discounts</h2>
        <div className="grid-3">
          <Num label="Minimum seat price" value={s.minSeatPrice} step={0.5} onChange={(n) => set({ minSeatPrice: n })} />
          <Num label="Maximum seat price" value={s.maxSeatPrice} step={0.5} onChange={(n) => set({ maxSeatPrice: n })} />
          <Num label="Minimum private price" value={s.minPrivatePrice} onChange={(n) => set({ minPrivatePrice: n })} />
          <Num label="Maximum private price" value={s.maxPrivatePrice} onChange={(n) => set({ maxPrivatePrice: n })} />
        </div>
        <h3 style={{ margin: 0 }}>Group discounts (shared rides)</h3>
        {s.groupDiscounts.map((g, i) => (
          <div className="tier-row" key={i}>
            <Num label={`Discount ${i + 1} from passengers`} value={g.minPassengers} onChange={(n) => set({ groupDiscounts: s.groupDiscounts.map((x, j) => (j === i ? { ...x, minPassengers: n } : x)) })} />
            <Num label={`Discount ${i + 1} percent`} value={g.percent} onChange={(n) => set({ groupDiscounts: s.groupDiscounts.map((x, j) => (j === i ? { ...x, percent: n } : x)) })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ groupDiscounts: s.groupDiscounts.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ groupDiscounts: [...s.groupDiscounts, { minPassengers: 4, percent: 5 }] })}>+ Add discount</button></div>
      </section>
      <section className="panel form-stack">
        <h2 style={{ margin: 0 }}>Sales</h2>
        <div className="grid-3">
          <Num label="Default sales close (minutes)" value={s.defaultSalesCloseMinutes} onChange={(n) => set({ defaultSalesCloseMinutes: n })} hint="Minutes before departure that sales stop. Can be changed per departure." />
          <Num label="Seat hold while paying (minutes)" value={s.holdMinutes} onChange={(n) => set({ holdMinutes: n })} />
          <Num label="Max passengers per online booking" value={s.maxPassengersOnline} onChange={(n) => set({ maxPassengersOnline: n })} />
        </div>
      </section>
      <section className="panel form-stack">
        <h2 style={{ margin: 0 }}>Invoice issuer</h2>
        <div className="grid-2">
          <Text label="Company name" value={s.company.name} onChange={(v) => set({ company: { ...s.company, name: v } })} />
          <Text label="Address" value={s.company.address} onChange={(v) => set({ company: { ...s.company, address: v } })} />
          <Text label="VAT ID" value={s.company.vatId} onChange={(v) => set({ company: { ...s.company, vatId: v } })} />
          <Text label="Registration number" value={s.company.regNo} onChange={(v) => set({ company: { ...s.company, regNo: v } })} />
          <Text label="IBAN" value={s.company.iban} onChange={(v) => set({ company: { ...s.company, iban: v } })} />
          <Text label="Company email" value={s.company.email} onChange={(v) => set({ company: { ...s.company, email: v } })} />
          <Text label="Company phone" value={s.company.phone} onChange={(v) => set({ company: { ...s.company, phone: v } })} />
          <Num label="VAT rate (%)" value={Math.round(s.vatRate * 1000) / 10} step={0.1} onChange={(n) => set({ vatRate: n / 100 })} hint="Prices include VAT. Confirm the rate with your accountant." />
          <Text label="Invoice number prefix" value={s.invoicePrefix} onChange={(v) => set({ invoicePrefix: v })} />
        </div>
      </section>
      <section className="panel form-stack">
        <h2 style={{ margin: 0 }}>Ticket</h2>
        <div className="grid-2">
          <Text label="Meeting point image URL" value={s.meetingPoint.imageUrl} onChange={(v) => set({ meetingPoint: { ...s.meetingPoint, imageUrl: v } })} />
          <Text label="Support phone" value={s.supportPhone} onChange={(v) => set({ supportPhone: v })} />
        </div>
        <label className="sinput"><span>Directions to the vans</span>
          <textarea aria-label="Directions to the vans" rows={3} value={s.meetingPoint.text} onChange={(e) => set({ meetingPoint: { ...s.meetingPoint, text: e.target.value } })} /></label>
      </section>
      <div><button className="btn btn-primary" aria-label="Save settings (bottom)">Save settings</button></div>
    </form>
  );
}
