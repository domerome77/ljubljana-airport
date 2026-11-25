import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the landing heading', () => {
  render(<App />);
  expect(screen.getByText(/Airport transfers/i)).toBeInTheDocument();
});
