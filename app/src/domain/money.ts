export const toCents = (eur: number): number => Math.round(eur * 100);
export const fromCents = (cents: number): number => cents / 100;
export const formatEur = (eur: number): string => `${eur.toFixed(2)} €`;
/** Short price: 14 € for whole euros, 13.50 € otherwise. */
export const formatEurShort = (eur: number): string => (Number.isInteger(eur) ? `${eur} €` : formatEur(eur));
