import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { makeApi, renderAdmin } from './helpers';

beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

async function openDesk() {
  const a = await makeApi('desk');
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  renderAdmin(a.api, '/desk');
  await screen.findByRole('button', { name: /^11:00/ });
  return { ...a, print };
}

test('passenger name is required; email optional; card is the default payment', async () => {
  const { api } = await openDesk();
  const spy = vi.spyOn(api, 'deskBook');
  expect(screen.getByRole('radio', { name: 'Card terminal' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: /Confirm & print/ }));
  expect(screen.getByText('Passenger name is required')).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
});

test('confirm & print books, shows the ticket with plate and prints', async () => {
  const { api, d, print } = await openDesk();
  await userEvent.selectOptions(screen.getByLabelText('Passengers'), '3');
  await userEvent.type(screen.getByLabelText('Passenger name'), 'Walk-in Guest');
  await userEvent.click(screen.getByRole('radio', { name: 'Cash' }));
  await userEvent.click(screen.getByRole('button', { name: /Confirm & print/ }));
  expect(await screen.findByText('LJ-AB-123')).toBeInTheDocument();
  await waitFor(() => expect(print).toHaveBeenCalled());
  const [b] = await api.listBookings({ text: 'Walk-in' });
  expect(b).toMatchObject({ channel: 'desk', paymentMethod: 'desk_cash', passengers: 3, status: 'paid' });
  const [pub] = await api.listDepartures('LJU-LJ');
  expect(pub.id).toBe(d.id);
  expect(pub.seatsLeft).toBe(5);
});

test('thermal printer preference is remembered', async () => {
  await openDesk();
  await userEvent.click(screen.getByLabelText('Thermal printer (80 mm)'));
  expect(window.localStorage.getItem('goopti-desk-thermal')).toBe('1');
});
