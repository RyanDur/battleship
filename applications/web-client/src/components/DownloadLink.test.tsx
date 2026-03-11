import {render, screen, waitFor} from '@testing-library/react'
import {DownloadLink} from './DownloadLink'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'
const DIRECT_DMG = 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg'

const resolves = (url: string) => () => Promise.resolve(url)

describe('DownloadLink', () => {
  it('shows platform-specific label for macOS', async () => {
    render(<DownloadLink platform="macos" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
    await waitFor(() => {
      expect(screen.getByRole('link', {name: 'Download for macOS'})).toBeInTheDocument()
    })
  })

  it('shows platform-specific label for Windows', async () => {
    render(<DownloadLink platform="windows" fetchDownloadUrl={resolves('https://example.com/Battleship.msi')}/>)
    await waitFor(() => {
      expect(screen.getByRole('link', {name: 'Download for Windows'})).toBeInTheDocument()
    })
  })

  it('shows platform-specific label for Linux', async () => {
    render(<DownloadLink platform="linux" fetchDownloadUrl={resolves('https://example.com/battleship.deb')}/>)
    await waitFor(() => {
      expect(screen.getByRole('link', {name: 'Download for Linux'})).toBeInTheDocument()
    })
  })

  it('shows generic label for unknown platform', async () => {
    render(<DownloadLink platform="unknown" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
    await waitFor(() => {
      expect(screen.getByRole('link', {name: 'Download'})).toBeInTheDocument()
    })
  })

  it('links directly to the installer for known platform', async () => {
    render(<DownloadLink platform="macos" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
    await waitFor(() => {
      expect(screen.getByRole('link')).toHaveAttribute('href', DIRECT_DMG)
    })
  })

  it('links to releases page for unknown platform', async () => {
    render(<DownloadLink platform="unknown" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
    await waitFor(() => {
      expect(screen.getByRole('link')).toHaveAttribute('href', RELEASES_PAGE)
    })
  })

  it('falls back to releases page when fetch fails', async () => {
    const failing = () => Promise.reject(new Error('network error'))
    render(<DownloadLink platform="macos" fetchDownloadUrl={failing}/>)
    await waitFor(() => {
      expect(screen.getByRole('link')).toHaveAttribute('href', RELEASES_PAGE)
    })
  })

  it('shows Gatekeeper instructions for macOS', async () => {
    render(<DownloadLink platform="macos" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
    await waitFor(() => {
      expect(screen.getByText(/privacy & security/i)).toBeInTheDocument()
    })
  })

  it('does not show Gatekeeper instructions for Windows', async () => {
    render(<DownloadLink platform="windows" fetchDownloadUrl={resolves('https://example.com/Battleship.msi')}/>)
    await waitFor(() => {
      expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
    })
  })

  it('does not show Gatekeeper instructions for Linux', async () => {
    render(<DownloadLink platform="linux" fetchDownloadUrl={resolves('https://example.com/battleship.deb')}/>)
    await waitFor(() => {
      expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
    })
  })

  it('does not show Gatekeeper instructions for unknown platform', async () => {
    render(<DownloadLink platform="unknown" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
    await waitFor(() => {
      expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
    })
  })
})
