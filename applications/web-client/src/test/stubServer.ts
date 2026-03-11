import * as http from 'node:http'
import type {AddressInfo} from 'node:net'

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void

export interface StubServer {
  url: string
  close: () => Promise<void>
}

export function createStubServer(routes: Record<string, RouteHandler>): Promise<StubServer> {
  const errors: string[] = []

  const server = http.createServer((req, res) => {
    const key = `${req.method} ${req.url}`
    const handler = routes[key]
    if (!handler) {
      errors.push(`Unstubbed request: ${key}`)
      res.writeHead(500)
      res.end(`No stub registered for ${key}`)
      return
    }
    handler(req, res)
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res, rej) => {
          server.close(() => {
            if (errors.length > 0) rej(new Error(errors.join('\n')))
            else res()
          })
        }),
      })
    })
  })
}
