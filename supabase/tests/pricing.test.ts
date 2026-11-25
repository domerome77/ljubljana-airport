import vectors from '../../app/src/domain/vectors.json';
import { defaultSettings } from '../../app/src/api/mock/seed';
import { freshDb } from './setup';

test('default settings row equals the app demo defaults', async () => {
  const t = await freshDb();
  const { data } = await t.one<{ data: unknown }>('service_role', 'select data from settings where id = 1');
  expect(data).toEqual(defaultSettings());
});

describe('quote() matches the TypeScript pricing vectors', () => {
  for (const v of vectors) {
    test(v.name, async () => {
      const t = await freshDb();
      await t.db.query(`update settings set data = jsonb_set(jsonb_set(data, '{defaultSeatPrice,LJU-LJ}', $1::jsonb), '{groupDiscounts}', $2::jsonb)`,
        [JSON.stringify(v.defaultPrice), JSON.stringify(v.discounts)]);
      const veh = await t.vehicle(60);
      const dep = await t.departure({ vehicleId: veh, tiers: v.tiers });
      if (v.alreadyTaken > 0) {
        await t.db.query(`insert into bookings (ref, token, departure_id, product, passengers, seats_taken, amount, buyer, channel, status, payment_method, paid_at)
          values ('LJU-SEED01', 'x', $1, 'shared', $2, $2, 0, '{"name":"Seed"}', 'desk', 'paid', 'desk_cash', now())`, [dep, v.alreadyTaken]);
      }
      const { quote } = await t.one<{ quote: { amount: number } }>('anon', 'select quote($1, $2, $3)', [dep, 'shared', v.passengers]);
      expect(Number(quote.amount)).toBe(v.expectedAmount);
    });
  }
});

test('quote lines use the same labels as the app', async () => {
  const t = await freshDb();
  const veh = await t.vehicle(8);
  const dep = await t.departure({ vehicleId: veh, tiers: [{ seatCount: 3, pricePerSeat: 12 }, { seatCount: 5, pricePerSeat: 14 }] });
  const { quote } = await t.one<{ quote: { lines: unknown } }>('anon', 'select quote($1, $2, $3)', [dep, 'shared', 5]);
  expect(quote.lines).toEqual([
    { label: '3 × 12.00 €', amount: 36 },
    { label: '2 × 14.00 €', amount: 28 },
    { label: 'Group discount 10 %', amount: -6.4 },
  ]);
});
