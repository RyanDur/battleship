import {render, screen, waitFor} from '@testing-library/react'
import {DownloadLink} from './DownloadLink'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'
const DIRECT_DMG = 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg'

const resolves = (url: string) => () => Promise.resolve(url)

describe('DownloadLink', () => {
  describe('download action', () => {
    it('shows platform-specific label for macOS', async () => {
      render(<DownloadLink platform="macos" action="download" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Download for macOS'})).toBeInTheDocument()
      })
    })

    it('shows platform-specific label for Windows', async () => {
      render(<DownloadLink platform="windows" action="download" fetchDownloadUrl={resolves('https://example.com/Battleship.msi')}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Download for Windows'})).toBeInTheDocument()
      })
    })

    it('shows platform-specific label for Linux', async () => {
      render(<DownloadLink platform="linux" action="download" fetchDownloadUrl={resolves('https://example.com/battleship.deb')}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Download for Linux'})).toBeInTheDocument()
      })
    })

    it('shows generic label for unknown platform', async () => {
      render(<DownloadLink platform="unknown" action="download" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Download'})).toBeInTheDocument()
      })
    })
  })

  describe('upgrade action', () => {
    it('shows upgrade label for macOS', async () => {
      render(<DownloadLink platform="macos" action="upgrade" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Upgrade for macOS'})).toBeInTheDocument()
      })
    })

    it('shows upgrade label for Windows', async () => {
      render(<DownloadLink platform="windows" action="upgrade" fetchDownloadUrl={resolves('https://example.com/Battleship.msi')}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Upgrade for Windows'})).toBeInTheDocument()
      })
    })

    it('shows upgrade label for Linux', async () => {
      render(<DownloadLink platform="linux" action="upgrade" fetchDownloadUrl={resolves('https://example.com/battleship.deb')}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Upgrade for Linux'})).toBeInTheDocument()
      })
    })

    it('shows generic upgrade label for unknown platform', async () => {
      render(<DownloadLink platform="unknown" action="upgrade" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link', {name: 'Upgrade'})).toBeInTheDocument()
      })
    })
  })

  describe('none action', () => {
    it('shows no link when service is running and up to date', async () => {
      render(<DownloadLink platform="macos" action="none" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
      })
    })

    it('shows no Gatekeeper instructions when no link is shown', async () => {
      render(<DownloadLink platform="macos" action="none" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('link href', () => {
    it('links directly to the installer for known platform', async () => {
      render(<DownloadLink platform="macos" action="download" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link')).toHaveAttribute('href', DIRECT_DMG)
      })
    })

    it('links to releases page for unknown platform', async () => {
      render(<DownloadLink platform="unknown" action="download" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link')).toHaveAttribute('href', RELEASES_PAGE)
      })
    })

    it('falls back to releases page when fetch fails', async () => {
      const failing = () => Promise.reject(new Error('network error'))
      render(<DownloadLink platform="macos" action="download" fetchDownloadUrl={failing}/>)
      await waitFor(() => {
        expect(screen.getByRole('link')).toHaveAttribute('href', RELEASES_PAGE)
      })
    })

    it('upgrade action links to the installer', async () => {
      render(<DownloadLink platform="macos" action="upgrade" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByRole('link')).toHaveAttribute('href', DIRECT_DMG)
      })
    })
  })

  describe('Gatekeeper instructions', () => {
    it('shows for macOS on download', async () => {
      render(<DownloadLink platform="macos" action="download" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByText(/privacy & security/i)).toBeInTheDocument()
      })
    })

    it('shows for macOS on upgrade', async () => {
      render(<DownloadLink platform="macos" action="upgrade" fetchDownloadUrl={resolves(DIRECT_DMG)}/>)
      await waitFor(() => {
        expect(screen.getByText(/privacy & security/i)).toBeInTheDocument()
      })
    })

    it('does not show for Windows', async () => {
      render(<DownloadLink platform="windows" action="download" fetchDownloadUrl={resolves('https://example.com/Battleship.msi')}/>)
      await waitFor(() => {
        expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
      })
    })

    it('does not show for Linux', async () => {
      render(<DownloadLink platform="linux" action="download" fetchDownloadUrl={resolves('https://example.com/battleship.deb')}/>)
      await waitFor(() => {
        expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
      })
    })

    it('does not show for unknown platform', async () => {
      render(<DownloadLink platform="unknown" action="download" fetchDownloadUrl={resolves(RELEASES_PAGE)}/>)
      await waitFor(() => {
        expect(screen.queryByText(/privacy & security/i)).not.toBeInTheDocument()
      })
    })
  })
})
