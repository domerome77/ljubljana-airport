import { formatLocal, toUtcFromLocal, dayLabel } from '../../src/domain/time';

beforeAll(() => { process.env.TZ = 'America/New_York'; });

test('formats in Ljubljana time regardless of device zone', () => {
  expect(formatLocal('2026-11-25T13:30:00Z', 'time')).toBe('14:30');
  expect(formatLocal('2026-11-25T13:30:00Z', 'date')).toBe('Wed 25 Nov');
});

test('converts Ljubljana local to UTC across DST', () => {
  expect(toUtcFromLocal('2026-07-01', '14:30')).toBe('2026-07-01T12:30:00.000Z');
  expect(toUtcFromLocal('2026-11-25', '14:30')).toBe('2026-11-25T13:30:00.000Z');
  expect(toUtcFromLocal('2026-03-30', '14:30')).toBe('2026-03-30T12:30:00.000Z');
});

test('dayLabel uses the Ljubljana calendar day', () => {
  expect(dayLabel('2026-11-25T23:30:00Z', '2026-11-25T10:00:00Z')).toBe('Tomorrow');
  expect(dayLabel('2026-11-25T22:30:00Z', '2026-11-25T10:00:00Z')).toBe('Today');
  expect(dayLabel('2026-11-25T15:00:00Z', '2026-11-25T10:00:00Z')).toBe('Today');
  expect(dayLabel('2026-11-28T15:00:00Z', '2026-11-25T10:00:00Z')).toBe('Sat 28 Nov');
});
