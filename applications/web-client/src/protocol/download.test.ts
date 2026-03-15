import type {IncomingMessage, ServerResponse} from 'node:http';
import {fetchDownloadUrl} from './download';
import {createStubServer} from '../test/stubServer';

const makeAsset = (name: string, url: string) => ({name, browser_download_url: url});

const releasesStub = (assets: {name: string; browser_download_url: string}[]) => ({
  routes: {
    'GET /': (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({assets}));
    },
  },
});

describe('fetchDownloadUrl', () => {
  it('returns dmg URL for macOS', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.msi'),
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/RyanDur/battleship/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ]));
    try {
      const result = await fetchDownloadUrl('macos', server.url).value;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.value).toBe('https://github.com/RyanDur/battleship/releases/download/v0.2.0/Battleship-1.2.0.dmg');
    } finally {
      await server.close();
    }
  });

  it('returns msi URL for Windows', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('Battleship-1.2.0.dmg', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.dmg'),
      makeAsset('Battleship-1.2.0.msi', 'https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi'),
    ]));
    try {
      const result = await fetchDownloadUrl('windows', server.url).value;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.value).toBe('https://github.com/example/releases/download/v0.2.0/Battleship-1.2.0.msi');
    } finally {
      await server.close();
    }
  });

  it('returns deb URL for Linux', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('battleship_1.2.0_amd64.deb', 'https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb'),
    ]));
    try {
      const result = await fetchDownloadUrl('linux', server.url).value;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.value).toBe('https://github.com/example/releases/download/v0.2.0/battleship_1.2.0_amd64.deb');
    } finally {
      await server.close();
    }
  });

  it('returns failure for unknown platform', async () => {
    const result = await fetchDownloadUrl('unknown').value;
    expect(result.kind).toBe('failure');
  });

  it('returns failure when no matching asset found', async () => {
    const server = await createStubServer(releasesStub([
      makeAsset('checksums.txt', 'https://github.com/example/releases/download/v0.2.0/checksums.txt'),
    ]));
    try {
      const result = await fetchDownloadUrl('macos', server.url).value;
      expect(result.kind).toBe('failure');
    } finally {
      await server.close();
    }
  });

  it('returns failure when server is unreachable', async () => {
    const result = await fetchDownloadUrl('macos', 'http://127.0.0.1:1').value;
    expect(result.kind).toBe('failure');
  });

  it('returns failure when API returns non-ok response', async () => {
    const server = await createStubServer({
      routes: {
        'GET /': (_req, res) => {
          res.writeHead(500);
          res.end();
        },
      },
    });
    try {
      const result = await fetchDownloadUrl('macos', server.url).value;
      expect(result.kind).toBe('failure');
    } finally {
      await server.close();
    }
  });
});
