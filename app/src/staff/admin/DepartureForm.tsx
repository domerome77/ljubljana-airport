import { useEffect, useState, type FormEvent } from 'react';
import type { Api, DepartureAdminView } from '../../api/Api';
import { localHm, localYmd, toUtcFromLocal } from '../../domain/time';
import type { Departure, PriceTier, Route, Settings, Vehicle } from '../../domain/types';
import { errMsg } from '../useLoad';

interface Props {
  api: Api; routes: Route[]; vehicles: Vehicle[]; settings: Settings; existing: DepartureAdminView | null; defaultDay: string;
  onSaved: (d: Departure) => void; onCancel: () => void;
}

export function DepartureForm({ api, routes, vehicles, settings, existing, defaultDay, onSaved, onCancel }: Props) {
  const usable = vehicles.filter((v) => v.active || v.id === existing?.vehicleId);
  const [routeId, setRouteId] = useState(existing?.routeId ?? routes[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState(existing?.vehicleId ?? usable[0]?.id ?? '');
  const [date, setDate] = useState(existing ? localYmd(existing.departsAt) : defaultDay);
  const [time, setTime] = useState(existing ? localHm(existing.departsAt) : '12:00');
  const [sellShared, setSellShared] = useState(existing?.sellShared ?? true);
  const [sellPrivate, setSellPrivate] = useState(existing?.sellPrivate ?? true);
  const [privatePrice, setPrivatePrice] = useState(existing?.privatePrice?.toString() ?? '');
  const [salesClose, setSalesClose] = useState(existing?.salesCloseMinutes ?? settings.defaultSalesCloseMinutes);
  const [blocked, setBlocked] = useState(existing?.blockedSeats ?? 0);
  const [blockedNote, setBlockedNote] = useState(existing?.blockedNote ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const routeCode = routes.find((r) => r.id === routeId)?.code ?? 'LJU-LJ';
  const [tiers, setTiers] = useState<PriceTier[]>(existing?.tiers ?? settings.tierTemplate[routeCode] ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) setTiers((settings.tierTemplate[routeCode] ?? []).map((t) => ({ ...t })));
  }, [routeCode, existing, settings]);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const tierSeats = tiers.reduce((s, t) => s + (t.seatCount || 0), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !/^\d{2}:\d{2}$/.test(time)) { setError('Enter a date and time (HH:MM)'); return; }
    setBusy(true);
    try {
      const saved = await api.saveDeparture({
        id: existing?.id, routeId, vehicleId, departsAt: toUtcFromLocal(date, time), sellShared, sellPrivate,
        privatePrice: privatePrice.trim() === '' ? null : Number(privatePrice), salesCloseMinutes: salesClose,
        blockedSeats: blocked, blockedNote: blockedNote.trim() || undefined, tiers, notes: notes.trim() || undefined,
      });
      onSaved(saved);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const setTier = (i: number, patch: Partial<PriceTier>) => setTiers(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="grid-2">
        <label className="sinput"><span>Route</span>
          <select aria-label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="sinput"><span>Vehicle</span>
          <select aria-label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {usable.map((v) => <option key={v.id} value={v.id}>{v.internalName} · {v.plate} · {v.seats} seats</option>)}
          </select>
          {usable.length === 0 && <small>Add a vehicle first.</small>}
        </label>
      </div>
      <div className="grid-3">
        <label className="sinput"><span>Date</span><input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="sinput"><span>Time</span><input aria-label="Time" type="text" inputMode="numeric" placeholder="HH:MM" value={time} onChange={(e) => setTime(e.target.value)} />
          <small>Departure from the airport, Ljubljana time.</small></label>
        <label className="sinput"><span>Sales close (minutes before)</span>
          <input aria-label="Sales close (minutes before)" type="number" min={0} value={salesClose} onChange={(e) => setSalesClose(e.target.valueAsNumber)} />
          <small>Web and desk stop selling this many minutes before departure.</small></label>
      </div>
      <div className="form-section">
        <h3>Shared seats</h3>
        <label className="scheck"><input type="checkbox" checked={sellShared} onChange={(e) => setSellShared(e.target.checked)} />Sell shared seats</label>
        <p className="muted">Seats are sold in order: the first tier's seats at its price, then the next tier… Seats beyond all tiers cost {settings.defaultSeatPrice[routeCode]} € (default). Group discounts apply on top.</p>
        <div className="form-stack">
          {tiers.map((t, i) => (
            <div className="tier-row" key={i}>
              <label className="sinput"><span>Tier {i + 1} seats</span>
                <input aria-label={`Tier ${i + 1} seats`} type="number" min={1} value={Number.isNaN(t.seatCount) ? '' : t.seatCount} onChange={(e) => setTier(i, { seatCount: e.target.valueAsNumber })} /></label>
              <label className="sinput"><span>Tier {i + 1} price (€ per seat)</span>
                <input aria-label={`Tier ${i + 1} price`} type="number" min={0} step="0.5" value={Number.isNaN(t.pricePerSeat) ? '' : t.pricePerSeat} onChange={(e) => setTier(i, { pricePerSeat: e.target.valueAsNumber })} /></label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setTiers([...tiers, { seatCount: 3, pricePerSeat: tiers.at(-1)?.pricePerSeat ?? settings.defaultSeatPrice[routeCode] }])}>+ Add price tier</button>
            {vehicle && <span className="muted" style={{ marginLeft: 12 }}>Tiers cover {tierSeats} of {vehicle.seats} seats.</span>}</div>
        </div>
      </div>
      <div className="form-section grid-2">
        <div>
          <h3>Private van</h3>
          <label className="scheck"><input type="checkbox" checked={sellPrivate} onChange={(e) => setSellPrivate(e.target.checked)} />Sell as private (whole van)</label>
          <label className="sinput"><span>Private price (€)</span>
            <input aria-label="Private price" type="number" min={0} placeholder={`${settings.defaultPrivatePrice[routeCode]} (default)`} value={privatePrice} onChange={(e) => setPrivatePrice(e.target.value)} />
            <small>Only offered while no seat is sold or blocked.</small></label>
        </div>
        <div>
          <h3>Seats sold elsewhere</h3>
          <label className="sinput"><span>Blocked seats</span>
            <input aria-label="Blocked seats" type="number" min={0} value={Number.isNaN(blocked) ? '' : blocked} onChange={(e) => setBlocked(e.target.valueAsNumber)} />
            <small>E.g. seats already sold via GoOpti — they are taken out of sale here.</small></label>
          <label className="sinput"><span>Note</span><input aria-label="Blocked note" value={blockedNote} placeholder="Sold via GoOpti" onChange={(e) => setBlockedNote(e.target.value)} /></label>
        </div>
      </div>
      <label className="sinput"><span>Internal notes</span><input aria-label="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !vehicleId}>Save departure</button>
      </div>
    </form>
  );
}
