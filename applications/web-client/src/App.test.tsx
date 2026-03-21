import {render, screen, within} from '@testing-library/react';
import {App} from './App';
import type {Config} from './protocol/config';

const config: Config = {version: '1.2.3', serviceUrl: 'http://localhost:8080'};

describe('App', () => {
  it('renders heading in the header', () => {
    render(<App config={config}/>);

    expect(within(screen.getByRole('banner')).getByRole('heading', {name: /battleship/i})).toBeInTheDocument();
  });

  it('renders download link in the header', () => {
    render(<App config={config}/>);

    expect(within(screen.getByRole('banner')).getByRole('link', {name: /download/i})).toBeInTheDocument();
  });

  it('shows version from config in the footer', () => {
    render(<App config={config}/>);

    expect(within(screen.getByRole('contentinfo')).getByText('1.2.3')).toBeInTheDocument();
  });
});
