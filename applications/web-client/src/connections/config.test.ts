import type {IncomingMessage, ServerResponse} from 'node:http';
import {loadConfig} from './config';
import {createStubServer} from '../test/stubServer';

const configStub = (config: unknown) => ({
  routes: {
    'GET /config.json': (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(config));
    },
  },
});

describe('loadConfig', () => {
  it('returns version and serviceUrl from config.json', async () => {
    const server = await createStubServer(configStub({version: '1.2.3', serviceUrl: 'http://localhost:9090'}));
    const result = await loadConfig(`${server.url}/config.json`).value;
    await server.close();

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.value.version).toBe('1.2.3');
      expect(result.value.serviceUrl).toBe('http://localhost:9090');
    }
  });

  it('falls back to defaults when server is unreachable', async () => {
    const result = await loadConfig('http://127.0.0.1:1/config.json').value;

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.value.version).toBe('dev');
      expect(result.value.serviceUrl).toBe('http://localhost:8080');
    }
  });

  it('falls back to defaults when response is not ok', async () => {
    const server = await createStubServer({
      routes: {
        'GET /config.json': (_req, res) => { res.writeHead(404); res.end(); },
      },
    });
    const result = await loadConfig(`${server.url}/config.json`).value;
    await server.close();

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.value.version).toBe('dev');
      expect(result.value.serviceUrl).toBe('http://localhost:8080');
    }
  });

  it('falls back to defaults when config.json has invalid shape', async () => {
    const server = await createStubServer(configStub({unexpected: 'fields'}));
    const result = await loadConfig(`${server.url}/config.json`).value;
    await server.close();

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.value.version).toBe('dev');
      expect(result.value.serviceUrl).toBe('http://localhost:8080');
    }
  });
});
