import vectors from '../../src/domain/vectors.json';
import { quoteShared, quotePrivate } from '../../src/domain/pricing';

describe('quoteShared shared vectors', () => {
  for (const v of vectors) {
    test(v.name, () => {
      const q = quoteShared(v.tiers, v.defaultPrice, v.alreadyTaken, v.passengers, v.discounts);
      expect(q.amount).toBe(v.expectedAmount);
    });
  }
});

test('groups seat lines per price and labels the discount', () => {
  const q = quoteShared([{ seatCount: 3, pricePerSeat: 12 }, { seatCount: 5, pricePerSeat: 14 }], 18, 2, 3, []);
  expect(q.lines).toEqual([
    { label: '1 × 12.00 €', amount: 12 },
    { label: '2 × 14.00 €', amount: 28 },
  ]);
  const d = quoteShared([], 14, 0, 5, [{ minPassengers: 3, percent: 5 }, { minPassengers: 5, percent: 10 }]);
  expect(d.lines.at(-1)).toEqual({ label: 'Group discount 10 %', amount: -7 });
});

test('quotePrivate is a single whole-van line', () => {
  expect(quotePrivate(90)).toEqual({ amount: 90, lines: [{ label: 'Private van', amount: 90 }], seatsLeft: 0 });
});
