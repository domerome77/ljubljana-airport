export const TZ = 'Europe/Ljubljana';

const parts = (iso: string) => {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) o[p.type] = p.value;
  return o;
};

/** YYYY-MM-DD of the instant in Ljubljana. */
export function localYmd(iso: string): string {
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHm(iso: string): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

export function formatLocal(iso: string, fmt: 'time' | 'date' | 'datetime'): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .format(d).replace(',', '');
  if (fmt === 'time') return localHm(iso);
  if (fmt === 'date') return date;
  return `${date}, ${localHm(iso)}`;
}

/** Interpret a wall-clock time in Ljubljana and return the UTC ISO string. */
export function toUtcFromLocal(dateYmd: string, timeHm: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [hh, mm] = timeHm.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess).toISOString());
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayLabel(iso: string, nowIso: string): string {
  const day = localYmd(iso);
  const today = localYmd(nowIso);
  if (day === today) return 'Today';
  if (day === addDaysYmd(today, 1)) return 'Tomorrow';
  return formatLocal(iso, 'date');
}

export function minutesUntil(iso: string, nowIso: string): number {
  return Math.round((Date.parse(iso) - Date.parse(nowIso)) / 60_000);
}
