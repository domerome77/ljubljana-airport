import type { BookingRow } from '../../api/Api';
import { fromCents, toCents } from '../../domain/money';
import { formatLocal } from '../../domain/time';

export const CSV_HEADER = 'ref,channel,status,departure_local,route,product,passengers,amount,vat,net,payment_method,paid_at_local,buyer_name,buyer_email,company,invoice_number';

const cell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Gross includes VAT. net = round(gross / (1 + rate)), vat = gross − net. */
export function splitVat(gross: number, rate: number): { net: number; vat: number } {
  const g = toCents(gross);
  const n = Math.round(g / (1 + rate));
  return { net: fromCents(n), vat: fromCents(g - n) };
}

export function bookingsToCsv(rows: BookingRow[], vatRate: number): string {
  const lines = rows.map((b) => {
    const { net, vat } = splitVat(b.amount, vatRate);
    return [
      b.ref, b.channel, b.status, formatLocal(b.departsAt, 'datetime'), b.routeCode, b.product, b.passengers,
      b.amount.toFixed(2), vat.toFixed(2), net.toFixed(2), b.paymentMethod ?? '', b.paidAt ? formatLocal(b.paidAt, 'datetime') : '',
      b.buyer.name, b.buyer.email ?? '', b.buyer.company ? `${b.buyer.company.name} (${b.buyer.company.vatId})` : '', b.invoiceNumber ?? '',
    ].map(cell).join(',');
  });
  return `${CSV_HEADER}\n${lines.join('\n')}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
