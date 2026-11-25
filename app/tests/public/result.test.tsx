import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BookingResult } from '../../src/public/BookingResult';
import { fakeApi, paidView } from './fakeApi';

test('polls while held, then shows the ticket with plate', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const getBooking = vi.fn()
    .mockResolvedValueOnce({ ...paidView, status: 'held', plate: null })
    .mockResolvedValue(paidView);
  render(<BookingResult api={fakeApi({ getBooking })} id="bk1" token="tok" demo={false} pollMs={3000} />);
  expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(await screen.findByText('LJ-AB-123')).toBeInTheDocument();
  expect(screen.getByText('LJU-7K3F9Q')).toBeInTheDocument();
  expect(screen.getByText(/Tell your driver your address in Ljubljana/)).toBeInTheDocument();
  vi.useRealTimers();
});

test('expired booking explains that seats were released', async () => {
  render(<BookingResult api={fakeApi({ getBooking: vi.fn(async () => ({ ...paidView, status: 'expired', plate: null })) })} id="bk1" token="tok" demo={false} />);
  expect(await screen.findByText('Payment not completed — your seats were released')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to departures' })).toHaveAttribute('href', '#/');
});

test('demo mode shows a simulated Revolut panel that confirms payment', async () => {
  let status: 'held' | 'paid' = 'held';
  const api = { ...fakeApi({ getBooking: vi.fn(async () => (status === 'paid' ? paidView : { ...paidView, status: 'held' as const, plate: null })) }),
    confirmPayment: vi.fn(() => { status = 'paid'; }), failPayment: vi.fn() };
  render(<BookingResult api={api} id="bk1" token="tok" demo />);
  await userEvent.click(await screen.findByRole('button', { name: /Pay .* \(test\)/ }));
  expect(api.confirmPayment).toHaveBeenCalledWith('bk1');
  await waitFor(() => expect(screen.getByText('LJ-AB-123')).toBeInTheDocument());
});
