import type {IncomingMessage, ServerResponse} from 'node:http'
import {fetchDownloadUrl} from './download'
import {createStubServer} from '../test/stubServer'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'

const makeAsset = (name: string, url: string) => ({name, browser_download_url: url})

function releasesStub(assets: {name: string; browser_download_url: string}[]) {
  return {
    'GET /': (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({assets}))
    },
  }
}

describe('fetchDownloadUrl', () => {
  it('returns dmg URL for macOS', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.msi'),
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ]))
    try {
      const url = await fetchDownloadUrl('macos', server.url)
      expect(url).toBe('https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg')
    } finally {
      await server.close()
    }
  })

  it('returns msi URL for Windows', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi'),
    ]))
    try {
      const url = await fetchDownloadUrl('windows', server.url)
      expect(url).toBe('https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi')
    } finally {
      await server.close()
    }
  })

  it('returns deb URL for Linux', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ]))
    try {
      const url = await fetchDownloadUrl('linux', server.url)
      expect(url).toBe('https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb')
    } finally {
      await server.close()
    }
  })

  it('falls back to releases page for unknown platform', async () => {
    const url = await fetchDownloadUrl('unknown')
    expect(url).toBe(RELEASES_PAGE)
  })

  it('falls back to releases page when no matching asset found', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('checksums.txt', 'https://github.com/example/releases/download/v0.2.0/checksums.txt'),
    ]))
    try {
      const url = await fetchDownloadUrl('macos', server.url)
      expect(url).toBe(RELEASES_PAGE)
    } finally {
      await server.close()
    }
  })

  it('falls back to releases page when server is unreachable', async () => {
    const url = await fetchDownloadUrl('macos', 'http://127.0.0.1:1')
    expect(url).toBe(RELEASES_PAGE)
  })

  it('falls back to releases page when API returns non-ok response', async () => {
    const server = await createStubServer({
      'GET /': (_req, res) => {
        res.writeHead(500)
        res.end()
      },
    })
    try {
      const url = await fetchDownloadUrl('macos', server.url)
      expect(url).toBe(RELEASES_PAGE)
    } finally {
      await server.close()
    }
  })
})
