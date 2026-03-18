import {render, screen, waitFor, within} from '@testing-library/react';
import {App} from './App';

describe('App', () => {
  it('renders heading in the header', async () => {
    render(<App/>);

    const header = screen.getByRole('banner');
    await waitFor(() => expect(within(header).getByRole('heading', {name: /battleship/i})).toBeInTheDocument());
  });

  it('renders download link in the header once config is loaded', async () => {
    render(<App/>);

    const header = screen.getByRole('banner');
    await waitFor(() => expect(within(header).getByRole('link', {name: /download/i})).toBeInTheDocument());
  });

  it('shows version in the footer', async () => {
    render(<App/>);

    const footer = screen.getByRole('contentinfo');
    await waitFor(() => expect(within(footer).getByText(/dev/i)).toBeInTheDocument());
  });
});
