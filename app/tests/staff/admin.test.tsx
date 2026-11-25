import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { bookingsToCsv } from '../../src/staff/admin/exportCsv';
import { at, makeApi, renderAdmin } from './helpers';

test('signed-out users see the login form; desk role is not allowed in admin', async () => {
  const a = await makeApi(null);
  renderAdmin(a.api);
  expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Email'), 'desk@demo');
  await userEvent.type(screen.getByLabelText('Password'), 'demo');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Not allowed')).toBeInTheDocument();
});

test('add a vehicle; seats are validated', async () => {
  const { api } = await makeApi();
  renderAdmin(api, '/admin/vehicles');
  await userEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
  await userEvent.type(screen.getByLabelText('Name (internal)'), 'Vito');
  await userEvent.type(screen.getByLabelText('Licence plate'), 'lj-ef-789');
  await userEvent.clear(screen.getByLabelText('Seats'));
  await userEvent.type(screen.getByLabelText('Seats'), '0');
  await userEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));
  expect(await screen.findByText('Seats must be between 1 and 60')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Seats'));
  await userEvent.type(screen.getByLabelText('Seats'), '6');
  await userEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));
  expect(await screen.findByText('LJ-EF-789')).toBeInTheDocument();
});

test('new departure is prefilled from settings and validates price bounds', async () => {
  const { api } = await makeApi();
  renderAdmin(api, '/admin/departures');
  await userEvent.click(await screen.findByRole('button', { name: 'Add departure' }));
  await userEvent.selectOptions(screen.getByLabelText('Route'), 'route-bled');
  expect(screen.getByLabelText('Sales close (minutes before)')).toHaveValue(10);
  expect(screen.getByLabelText('Tier 1 price')).toHaveValue(22);
  await userEvent.clear(screen.getByLabelText('Tier 1 price'));
  await userEvent.type(screen.getByLabelText('Tier 1 price'), '99');
  await userEvent.click(screen.getByRole('button', { name: 'Save departure' }));
  expect(await screen.findByText('Price must be between 5 € and 60 €')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Tier 1 price'));
  await userEvent.type(screen.getByLabelText('Tier 1 price'), '22');
  await userEvent.clear(screen.getByLabelText('Time'));
  await userEvent.type(screen.getByLabelText('Time'), '14:30');
  await userEvent.click(screen.getByRole('button', { name: 'Save departure' }));
  expect(await screen.findByText('14:30')).toBeInTheDocument();
});

test('repeat Mon–Fri over two weeks creates 10 departures', async () => {
  const { api, d } = await makeApi();
  renderAdmin(api, '/admin/departures');
  const row = await screen.findByTestId(`dep-${d.id}`);
  await userEvent.click(within(row).getByRole('button', { name: 'Repeat' }));
  await userEvent.clear(screen.getByLabelText('From'));
  await userEvent.type(screen.getByLabelText('From'), '2026-11-30');
  await userEvent.clear(screen.getByLabelText('Until'));
  await userEvent.type(screen.getByLabelText('Until'), '2026-12-13');
  await userEvent.click(screen.getByLabelText('Sat'));
  await userEvent.click(screen.getByLabelText('Sun'));
  await userEvent.click(screen.getByRole('button', { name: 'Create departures' }));
  expect(await screen.findByText('10 departures created')).toBeInTheDocument();
});

test('blocked seats show on the Today board', async () => {
  const { api, d } = await makeApi();
  await api.saveDeparture({ ...d, blockedSeats: 3, blockedNote: 'GoOpti' });
  renderAdmin(api, '/admin');
  const card = await screen.findByTestId(`board-${d.id}`);
  expect(card).toHaveTextContent('sold 0 · held 0 · blocked 3 · free 5');
  expect(card).toHaveTextContent('LJ-AB-123');
});

test('swapping to a smaller van than what is taken shows a clear error', async () => {
  const { api, d } = await makeApi();
  const small = await api.saveVehicle({ internalName: 'Small', plate: 'LJ-SM-1', seats: 6, active: true });
  await api.deskBook({ departureId: d.id, product: 'shared', passengers: 7, buyer: { name: 'Group' }, channel: 'desk', paymentMethod: 'desk_card' });
  renderAdmin(api, '/admin/departures');
  const row = await screen.findByTestId(`dep-${d.id}`);
  await userEvent.click(within(row).getByRole('button', { name: 'Edit' }));
  await userEvent.selectOptions(screen.getByLabelText('Vehicle'), small.id);
  await userEvent.click(screen.getByRole('button', { name: 'Save departure' }));
  expect(await screen.findByText('New vehicle has 6 seats but 7 are already taken')).toBeInTheDocument();
});

test('cancelling a paid booking warns about the credit note', async () => {
  const { api, d } = await makeApi();
  await api.deskBook({ departureId: d.id, product: 'shared', passengers: 2, buyer: { name: 'Marko Kranjc' }, channel: 'desk', paymentMethod: 'desk_card' });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderAdmin(api, '/admin/bookings');
  const row = await screen.findByText('Marko Kranjc');
  await userEvent.click(within(row.closest('tr')!).getByRole('button', { name: 'Cancel' }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('This issues a credit note. Refund the money in Revolut Business.'));
  await waitFor(() => expect(within(screen.getByText('Marko Kranjc').closest('tr')!).getByText('cancelled')).toBeInTheDocument());
  confirm.mockRestore();
});

test('CSV export has the agreed header and VAT split', async () => {
  const { api, d } = await makeApi();
  await api.deskBook({ departureId: d.id, product: 'shared', passengers: 1, buyer: { name: 'A, B' }, channel: 'desk', paymentMethod: 'desk_cash' });
  const rows = await api.listBookings({});
  const csv = bookingsToCsv(rows, 0.095);
  const [header, line] = csv.trim().split('\n');
  expect(header).toBe('ref,channel,status,departure_local,route,product,passengers,amount,vat,net,payment_method,paid_at_local,buyer_name,buyer_email,company,invoice_number');
  expect(line).toContain('"A, B"');
  expect(line).toContain(',12.00,1.04,10.96,desk_cash,');
});

test('settings persist after save', async () => {
  const { api } = await makeApi();
  const view = renderAdmin(api, '/admin/settings');
  const input = await screen.findByLabelText('Default sales close (minutes)');
  await userEvent.clear(input);
  await userEvent.type(input, '5');
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByText('Settings saved')).toBeInTheDocument();
  view.unmount();
  renderAdmin(api, '/admin/settings');
  expect(await screen.findByLabelText('Default sales close (minutes)')).toHaveValue(5);
  void at;
});
