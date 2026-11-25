import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Landing } from '../../src/public/Landing';
import { fakeApi, NOW } from './fakeApi';

const renderLanding = (api = fakeApi()) => {
  render(<Landing api={api} now={() => NOW} />);
  return api;
};
const depButton = (time: string) => screen.getByRole('button', { name: new RegExp(`^${time}`) });

test('defaults: Ljubljana, shared, 1 passenger, nearest departure preselected', async () => {
  const api = renderLanding();
  await waitFor(() => expect(depButton('14:30')).toHaveAttribute('aria-pressed', 'true'));
  expect(api.listDepartures).toHaveBeenCalledWith('LJU-LJ');
  expect(screen.getByLabelText('To')).toHaveValue('LJU-LJ');
  expect(screen.getByRole('radio', { name: 'Shared' })).toBeChecked();
  expect(screen.getByLabelText('Passengers')).toHaveValue('1');
  expect(depButton('14:30')).toHaveTextContent('in 25 min');
  expect(depButton('14:30')).toHaveTextContent('2 seats left');
});

test('switching destination loads Bled departures', async () => {
  const api = renderLanding();
  await screen.findByRole('button', { name: /^14:30/ });
  await userEvent.selectOptions(screen.getByLabelText('To'), 'LJU-BLED');
  expect(api.listDepartures).toHaveBeenCalledWith('LJU-BLED');
  await waitFor(() => expect(depButton('15:00')).toHaveAttribute('aria-pressed', 'true'));
});

test('private mode hides departures without a private price', async () => {
  renderLanding();
  await screen.findByRole('button', { name: /^14:30/ });
  await userEvent.click(screen.getByRole('radio', { name: 'Private' }));
  expect(screen.queryByRole('button', { name: /^14:30/ })).not.toBeInTheDocument();
  expect(depButton('16:00')).toHaveTextContent('whole van · up to 8 people · 70 €');
  await waitFor(() => expect(depButton('16:00')).toHaveAttribute('aria-pressed', 'true'));
});

test('too many passengers disables a departure and moves the selection', async () => {
  renderLanding();
  await screen.findByRole('button', { name: /^14:30/ });
  await userEvent.selectOptions(screen.getByLabelText('Passengers'), '3');
  expect(depButton('14:30')).toBeDisabled();
  expect(depButton('14:30')).toHaveTextContent('Only 2 seats left');
  await waitFor(() => expect(depButton('16:00')).toHaveAttribute('aria-pressed', 'true'));
});

test('price summary shows quote lines and total', async () => {
  renderLanding();
  await screen.findByRole('button', { name: /^14:30/ });
  await userEvent.selectOptions(screen.getByLabelText('Passengers'), '2');
  const summary = await screen.findByRole('region', { name: 'Price' });
  await waitFor(() => expect(within(summary).getByText('2 × 12.00 €')).toBeInTheDocument());
  expect(within(summary).getByTestId('total')).toHaveTextContent('24.00 €');
});

test('departures are grouped by day', async () => {
  renderLanding();
  await screen.findByRole('button', { name: /^14:30/ });
  expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument();
});

test('empty state when nothing is on sale', async () => {
  renderLanding(fakeApi({ listDepartures: async () => [] }));
  expect(await screen.findByText(/No vans on sale right now/)).toBeInTheDocument();
});
