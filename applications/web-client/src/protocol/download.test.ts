import {fetchDownloadUrl} from './download'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'

const makeAsset = (name: string, url: string) => ({name, browser_download_url: url})

const makeFetch = (assets: {name: string; browser_download_url: string}[]) =>
  () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({assets}),
  } as Response)

const failingFetch = () => Promise.reject(new Error('network error'))

describe('fetchDownloadUrl', () => {
  it('returns dmg URL for macOS', async () => {
    const fetch = makeFetch([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.msi'),
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ])
    const url = await fetchDownloadUrl('macos', fetch)
    expect(url).toBe('https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg')
  })

  it('returns msi URL for Windows', async () => {
    const fetch = makeFetch([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi'),
    ])
    const url = await fetchDownloadUrl('windows', fetch)
    expect(url).toBe('https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi')
  })

  it('returns deb URL for Linux', async () => {
    const fetch = makeFetch([
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ])
    const url = await fetchDownloadUrl('linux', fetch)
    expect(url).toBe('https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb')
  })

  it('falls back to releases page for unknown platform', async () => {
    const fetch = makeFetch([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
    ])
    const url = await fetchDownloadUrl('unknown', fetch)
    expect(url).toBe(RELEASES_PAGE)
  })

  it('falls back to releases page when no matching asset found', async () => {
    const fetch = makeFetch([
      makeAsset('checksums.txt', 'https://github.com/example/releases/download/v0.2.0/checksums.txt'),
    ])
    const url = await fetchDownloadUrl('macos', fetch)
    expect(url).toBe(RELEASES_PAGE)
  })

  it('falls back to releases page when API request fails', async () => {
    const url = await fetchDownloadUrl('macos', failingFetch)
    expect(url).toBe(RELEASES_PAGE)
  })

  it('falls back to releases page when API returns non-ok response', async () => {
    const fetch = () => Promise.resolve({ok: false, json: () => Promise.resolve({})} as Response)
    const url = await fetchDownloadUrl('macos', fetch)
    expect(url).toBe(RELEASES_PAGE)
  })
})
