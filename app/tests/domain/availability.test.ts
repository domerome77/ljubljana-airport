import { seatsLeft, isSellable, privateAvailable } from '../../src/domain/availability';

test('seatsLeft subtracts blocked and active taken seats', () => {
  expect(seatsLeft(8, 2, 3)).toBe(3);
  expect(seatsLeft(8, 5, 5)).toBe(0);
});

test('isSellable closes exactly salesCloseMinutes before departure', () => {
  expect(isSellable('2026-11-25T10:00:00Z', 10, '2026-11-25T09:49:59Z')).toBe(true);
  expect(isSellable('2026-11-25T10:00:00Z', 10, '2026-11-25T09:50:00Z')).toBe(false);
});

test('privateAvailable only when the van is untouched', () => {
  expect(privateAvailable({ capacity: 8, sellPrivate: true }, 8)).toBe(true);
  expect(privateAvailable({ capacity: 8, sellPrivate: true }, 7)).toBe(false);
  expect(privateAvailable({ capacity: 8, sellPrivate: false }, 8)).toBe(false);
});
