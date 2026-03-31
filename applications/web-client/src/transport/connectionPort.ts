export type ConnectionEvent =
  | { type: 'PEER_CONNECTED'; peerId: string; isOfferer: boolean }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_MESSAGE'; peerId: string; data: unknown }
  | { type: 'SERVER_MESSAGE'; data: unknown }

export type ConnectionPort = {
  sendToPeer: (peerId: string, message: unknown) => void
  sendToServer: (message: unknown) => void
  subscribe: (listener: (event: ConnectionEvent) => void) => () => void
}

export type ConnectionPortHandle = {
  port: ConnectionPort
  emit: (event: ConnectionEvent) => void
}

type PortDeps = {
  sendToPeer: (peerId: string, message: unknown) => void
  sendToServer: (message: unknown) => void
}

export const createConnectionPort = (deps: PortDeps): ConnectionPortHandle => {
  const listeners = new Set<(event: ConnectionEvent) => void>();
  return {
    port: {
      sendToPeer: deps.sendToPeer,
      sendToServer: deps.sendToServer,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (event) => listeners.forEach(fn => fn(event)),
  };
};
