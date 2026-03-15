import type {IncomingMessage, ServerResponse} from 'node:http'
import {loadConfig} from './config'
import {createStubServer} from '../test/stubServer'

const configStub = (config: unknown) => ({
  'GET /config.json': (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, {'Content-Type': 'application/json'})
    res.end(JSON.stringify(config))
  },
})

describe('loadConfig', () => {
  it('returns version and serviceUrl from config.json', async () => {
    const server = await createStubServer(configStub({version: '1.2.3', serviceUrl: 'http://localhost:9090'}))
    try {
      const config = await loadConfig(`${server.url}/config.json`)

      expect(config.version).toBe('1.2.3')
      expect(config.serviceUrl).toBe('http://localhost:9090')
    } finally {
      await server.close()
    }
  })

  it('falls back to defaults when server is unreachable', async () => {
    const config = await loadConfig('http://127.0.0.1:1/config.json')

    expect(config.version).toBe('dev')
    expect(config.serviceUrl).toBe('http://localhost:8080')
  })

  it('falls back to defaults when response is not ok', async () => {
    const server = await createStubServer({
      'GET /config.json': (_req, res) => { res.writeHead(404); res.end() },
    })
    try {
      const config = await loadConfig(`${server.url}/config.json`)

      expect(config.version).toBe('dev')
      expect(config.serviceUrl).toBe('http://localhost:8080')
    } finally {
      await server.close()
    }
  })

  it('falls back to defaults when config.json has invalid shape', async () => {
    const server = await createStubServer(configStub({unexpected: 'fields'}))
    try {
      const config = await loadConfig(`${server.url}/config.json`)

      expect(config.version).toBe('dev')
      expect(config.serviceUrl).toBe('http://localhost:8080')
    } finally {
      await server.close()
    }
  })
})
