// @vitest-environment node
import {startSignaling} from './signaling';
import {createStubServer} from '../test/stubServer';
import {makeWebSocket} from '../test/makeWebSocket';
import type {WsConnection} from '../test/stubServer';
import type {SignalingEvent} from './signaling';

const connect = async (serverSetup: (conn: WsConnection) => void = () => undefined) => {
  let wsConn: WsConnection | undefined;
  const server = await createStubServer({
    ws: {'/ws/signaling': conn => { wsConn = conn; serverSetup(conn); }},
  });
  const events: SignalingEvent[] = [];
  const handle = startSignaling({
    createWebSocket: makeWebSocket,
    url: server.url.replace('http://', 'ws://') + '/ws/signaling',
    name: 'Alice',
  }, e => events.push(e));

  await vi.waitFor(() => expect(wsConn).toBeDefined());
  const cleanup = async () => { handle.stop(); await server.close(); };
  return {events, handle, getConn: () => wsConn!, cleanup};
};

describe('startSignaling', () => {
  it('sends REGISTER with name on connect', async () => {
    const received: string[] = [];
    const {cleanup} = await connect(conn => conn.onMessage(msg => received.push(msg)));

    await vi.waitFor(() => {
      const msg = received.map(m => JSON.parse(m)).find((m: {type: string}) => m.type === 'REGISTER');
      expect(msg).toMatchObject({type: 'REGISTER', name: 'Alice'});
    });
    await cleanup();
  });

  it('emits REGISTERED event when server sends REGISTERED', async () => {
    const {events, getConn, cleanup} = await connect();

    getConn().send(JSON.stringify({type: 'REGISTERED', peerId: 'p1', name: 'Alice'}));

    await vi.waitFor(() => expect(events).toContainEqual({type: 'REGISTERED', peerId: 'p1', name: 'Alice'}));
    await cleanup();
  });

  it('emits PEERS event when server sends PEERS', async () => {
    const {events, getConn, cleanup} = await connect();

    const peers = [{peerId: 'p2', name: 'Bob'}];
    getConn().send(JSON.stringify({type: 'PEERS', peers}));

    await vi.waitFor(() => expect(events).toContainEqual({type: 'PEERS', peers}));
    await cleanup();
  });

  it('emits PEER_JOINED when server sends PEER_JOINED', async () => {
    const {events, getConn, cleanup} = await connect();

    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'p3', name: 'Carol'}));

    await vi.waitFor(() => expect(events).toContainEqual({type: 'PEER_JOINED', peerId: 'p3', name: 'Carol'}));
    await cleanup();
  });

  it('emits PEER_LEFT when server sends PEER_LEFT', async () => {
    const {events, getConn, cleanup} = await connect();

    getConn().send(JSON.stringify({type: 'PEER_LEFT', peerId: 'p3'}));

    await vi.waitFor(() => expect(events).toContainEqual({type: 'PEER_LEFT', peerId: 'p3'}));
    await cleanup();
  });

  it('stop prevents further events', async () => {
    const {events, handle, getConn, cleanup} = await connect();
    handle.stop();

    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'x', name: 'X'}));
    await new Promise(r => setTimeout(r, 100));

    expect(events.filter(e => e.type === 'PEER_JOINED')).toHaveLength(0);
    await cleanup();
  });
});
