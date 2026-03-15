import * as http from 'node:http'
import type {AddressInfo} from 'node:net'
import {WebSocketServer} from 'ws'

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void

export type WsConnection = {
  send: (data: string) => void
  close: () => void
}

type WsHandler = (conn: WsConnection) => void

type StubServerOptions = {
  routes?: Record<string, RouteHandler>
  ws?: Record<string, WsHandler>
}

export interface StubServer {
  url: string
  close: () => Promise<void>
}

export const createStubServer = (options: StubServerOptions): Promise<StubServer> => {
  const {routes = {}, ws = {}} = options
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

  const wss = new WebSocketServer({noServer: true})
  const activeSockets = new Set<import('node:stream').Duplex>()

  server.on('connection', (socket) => {
    activeSockets.add(socket)
    socket.on('close', () => activeSockets.delete(socket))
  })

  server.on('upgrade', (req, socket, head) => {
    const path = req.url ?? ''
    const handler = ws[path]
    if (!handler) {
      errors.push(`Unstubbed WebSocket: ${path}`)
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (wsSocket) => {
      handler({
        send: (data) => wsSocket.send(data),
        close: () => wsSocket.close(),
      })
    })
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res, rej) => {
          for (const socket of activeSockets) socket.destroy()
          wss.close()
          server.close(() => {
            if (errors.length > 0) rej(new Error(errors.join('\n')))
            else res()
          })
        }),
      })
    })
  })
}
