import {render, screen, waitFor} from '@testing-library/react';
import {AppShell} from './AppShell';

describe('AppShell', () => {
  it('shows a loading indicator before config is available', () => {
    render(<AppShell/>);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the app heading once config is loaded', async () => {
    render(<AppShell/>);

    await waitFor(() => expect(screen.getByRole('heading', {name: /battleship/i})).toBeInTheDocument());
  });
});
