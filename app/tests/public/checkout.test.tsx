import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ApiError } from '../../src/api/Api';
import { CheckoutForm } from '../../src/public/CheckoutForm';
import { fakeApi } from './fakeApi';

const quote = { amount: 24, lines: [{ label: '2 × 12.00 €', amount: 24 }], seatsLeft: 8 };

function setup(over = {}) {
  const api = fakeApi(over);
  const onRefresh = vi.fn();
  const redirect = vi.fn();
  render(<CheckoutForm api={api} departureId="d1" product="shared" passengers={2} quote={quote} onRefresh={onRefresh} redirect={redirect} />);
  return { api, onRefresh, redirect };
}
async function fill(email = 'ana@example.com') {
  await userEvent.type(screen.getByLabelText('Full name'), 'Ana Novak');
  if (email) await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.click(screen.getByLabelText(/I accept the/));
}
const payBtn = () => screen.getByRole('button', { name: /^Pay/ });

test('email is required before holding seats', async () => {
  const { api } = setup();
  await fill('');
  await userEvent.click(payBtn());
  expect(screen.getByText('Email is required')).toBeInTheDocument();
  expect(api.hold).not.toHaveBeenCalled();
});

test('invalid email is rejected', async () => {
  const { api } = setup();
  await fill('ana@');
  await userEvent.click(payBtn());
  expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
  expect(api.hold).not.toHaveBeenCalled();
});

test('company invoice section is collapsed and validated when opened', async () => {
  const { api } = setup();
  expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('Invoice to a company'));
  await fill();
  await userEvent.click(payBtn());
  expect(screen.getByText('Company name, address and VAT ID are required')).toBeInTheDocument();
  expect(api.hold).not.toHaveBeenCalled();
});

test('happy path holds seats with buyer data and redirects to Revolut', async () => {
  const { api, redirect } = setup();
  await fill();
  await userEvent.click(payBtn());
  await waitFor(() => expect(redirect).toHaveBeenCalledWith('https://checkout.revolut.com/pay/x'));
  expect(api.hold).toHaveBeenCalledWith({
    departureId: 'd1', product: 'shared', passengers: 2, channel: 'web', buyer: { name: 'Ana Novak', email: 'ana@example.com' },
  });
  expect(api.startCheckout).toHaveBeenCalledWith('bk1', 'tok');
});

test('sold out shows a clear message and refreshes departures', async () => {
  const { onRefresh, redirect } = setup({ hold: vi.fn(async () => { throw new ApiError('SOLD_OUT'); }) });
  await fill();
  await userEvent.click(payBtn());
  expect(await screen.findByText('Those seats were just taken — please pick another departure')).toBeInTheDocument();
  expect(onRefresh).toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

test('a changed price needs a second confirmation before paying', async () => {
  const { api, redirect } = setup({ hold: vi.fn(async () => ({ bookingId: 'bk1', token: 'tok', amount: 40, lines: [], holdExpiresAt: '' })) });
  await fill();
  await userEvent.click(payBtn());
  expect(await screen.findByText('Price updated to 40.00 €')).toBeInTheDocument();
  expect(redirect).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Pay 40.00 € with Revolut' }));
  await waitFor(() => expect(redirect).toHaveBeenCalled());
  expect(api.hold).toHaveBeenCalledTimes(1);
});
