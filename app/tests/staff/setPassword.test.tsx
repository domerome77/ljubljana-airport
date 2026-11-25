import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SetPassword } from '../../src/staff/SetPassword';

test('requires matching passwords of at least 10 characters, then saves', async () => {
  const setPassword = vi.fn(async () => {});
  const onDone = vi.fn();
  render(<SetPassword setPassword={setPassword} onDone={onDone} />);
  await userEvent.type(screen.getByLabelText('New password'), 'short');
  await userEvent.type(screen.getByLabelText('Repeat password'), 'short');
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(screen.getByText('Use at least 10 characters')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('New password'));
  await userEvent.type(screen.getByLabelText('New password'), 'long-enough-1');
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Repeat password'));
  await userEvent.type(screen.getByLabelText('Repeat password'), 'long-enough-1');
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(setPassword).toHaveBeenCalledWith('long-enough-1');
  expect(onDone).toHaveBeenCalled();
});
