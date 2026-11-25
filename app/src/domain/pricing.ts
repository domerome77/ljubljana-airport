import { formatEur, fromCents, toCents } from './money';
import type { GroupDiscount, PriceTier, Quote, QuoteLine } from './types';

/** Price of the n-th seat (1-based) of a departure, using fill-based tiers. */
export function seatPrice(tiers: PriceTier[], defaultPrice: number, n: number): number {
  let upper = 0;
  for (const t of tiers) {
    upper += t.seatCount;
    if (n <= upper) return t.pricePerSeat;
  }
  return defaultPrice;
}

export function bestDiscount(discounts: GroupDiscount[], passengers: number): number {
  return discounts.filter((d) => passengers >= d.minPassengers).reduce((m, d) => Math.max(m, d.percent), 0);
}

export function quoteShared(
  tiers: PriceTier[], defaultPrice: number, alreadyTaken: number, passengers: number, discounts: GroupDiscount[],
): Quote {
  const groups: { price: number; count: number }[] = [];
  for (let n = alreadyTaken + 1; n <= alreadyTaken + passengers; n++) {
    const price = seatPrice(tiers, defaultPrice, n);
    const last = groups.at(-1);
    if (last && last.price === price) last.count++;
    else groups.push({ price, count: 1 });
  }
  const lines: QuoteLine[] = groups.map((g) => ({
    label: `${g.count} × ${formatEur(g.price)}`,
    amount: fromCents(toCents(g.price) * g.count),
  }));
  let cents = groups.reduce((s, g) => s + toCents(g.price) * g.count, 0);
  const percent = bestDiscount(discounts, passengers);
  if (percent > 0) {
    const off = Math.round((cents * percent) / 100);
    lines.push({ label: `Group discount ${percent} %`, amount: -fromCents(off) });
    cents -= off;
  }
  return { amount: fromCents(cents), lines, seatsLeft: 0 };
}

export function quotePrivate(price: number): Quote {
  return { amount: price, lines: [{ label: 'Private van', amount: price }], seatsLeft: 0 };
}
