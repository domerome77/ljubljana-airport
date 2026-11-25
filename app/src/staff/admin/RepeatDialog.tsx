import { useState, type FormEvent } from 'react';
import type { Api, DepartureAdminView } from '../../api/Api';
import { addDaysYmd, formatLocal, localYmd } from '../../domain/time';
import { errMsg } from '../useLoad';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RepeatDialog({ api, dep, onDone }: { api: Api; dep: DepartureAdminView; onDone: (created: number) => void }) {
  const start = addDaysYmd(localYmd(dep.departsAt), 1);
  const [from, setFrom] = useState(start);
  const [until, setUntil] = useState(addDaysYmd(start, 13));
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!from || !until || until < from) { setMsg({ ok: false, text: 'Choose a valid date range' }); return; }
    try {
      const n = await api.repeatDeparture(dep.id, from, until, days);
      setMsg({ ok: true, text: `${n} departures created` });
      onDone(n);
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <p>Copy <b>{formatLocal(dep.departsAt, 'time')}</b> {dep.routeCode === 'LJU-BLED' ? 'LJU → Bled' : 'LJU → Ljubljana'} with <span className="plate">{dep.plate}</span> and the same prices to these days:</p>
      <div className="grid-2">
        <label className="sinput"><span>From</span><input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="sinput"><span>Until</span><input aria-label="Until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
      </div>
      <div className="weekdays" role="group" aria-label="Weekdays">
        {DAYS.map((d, i) => (
          <label key={d}><input type="checkbox" aria-label={d} checked={days.includes(i + 1)}
            onChange={(e) => setDays(e.target.checked ? [...days, i + 1] : days.filter((x) => x !== i + 1))} />{d}</label>
        ))}
      </div>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-bad'}`} role="status">{msg.text}</p>}
      <div className="modal-actions"><button type="submit" className="btn btn-primary" disabled={days.length === 0}>Create departures</button></div>
    </form>
  );
}
