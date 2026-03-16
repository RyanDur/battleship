// @vitest-environment node
import {createConnectionStore, createSignalingMiddleware, applyMiddleware} from './connectionStore';
import {createStubServer} from '../test/stubServer';
import {makeWebSocket} from '../test/makeWebSocket';
import type {WsConnection} from '../test/stubServer';

const connectStore = async (serverSetup: (conn: WsConnection) => void = () => undefined) => {
  let wsConn: WsConnection | undefined;
  const server = await createStubServer({
    routes: {'GET /session': (_req, res) => { res.writeHead(200); res.end(); }},
    ws: {'/ws/signaling': conn => { wsConn = conn; serverSetup(conn); }},
  });

  const store = createConnectionStore(applyMiddleware([
    createSignalingMiddleware({
      config: {
        createWebSocket: makeWebSocket,
        sessionUrl: `${server.url}/session`,
        url: `${server.url.replace('http://', 'ws://')}/ws/signaling`,
        name: 'Player',
      },
    }),
  ]));

  store.dispatch({type: 'START_SIGNALING'});
  await vi.waitFor(() => expect(wsConn).toBeDefined());

  const cleanup = async () => {
    store.dispatch({type: 'STOP_SIGNALING'});
    await server.close();
  };

  return {store, getConn: () => wsConn!, cleanup};
};

describe('createSignalingMiddleware (server)', () => {
  it('PEERS message updates onlinePeers in state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEERS', peers: [{peerId: 'p1', name: 'Alice'}]}));

    await vi.waitFor(() => expect(store.getState().onlinePeers).toEqual([{peerId: 'p1', name: 'Alice'}]));
    await cleanup();
  });

  it('PEER_JOINED message adds to onlinePeers', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'p1', name: 'Alice'}));

    await vi.waitFor(() => expect(store.getState().onlinePeers).toEqual([{peerId: 'p1', name: 'Alice'}]));
    await cleanup();
  });

  it('PEER_LEFT message removes from onlinePeers', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEERS', peers: [{peerId: 'p1', name: 'Alice'}]}));
    await vi.waitFor(() => expect(store.getState().onlinePeers).toHaveLength(1));
    getConn().send(JSON.stringify({type: 'PEER_LEFT', peerId: 'p1'}));

    await vi.waitFor(() => expect(store.getState().onlinePeers).toEqual([]));
    await cleanup();
  });

  it('RELAY_OFFER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch({type: 'RELAY_OFFER', targetPeerId: 'p1', sdp: 'v=0'});

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m) as object)).toContainEqual({type: 'RELAY_OFFER', targetPeerId: 'p1', sdp: 'v=0'})
    );
    await cleanup();
  });

  it('RELAY_ANSWER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch({type: 'RELAY_ANSWER', targetPeerId: 'p1', sdp: 'v=answer'});

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m) as object)).toContainEqual({type: 'RELAY_ANSWER', targetPeerId: 'p1', sdp: 'v=answer'})
    );
    await cleanup();
  });

  it('PREVIOUS_PEERS message updates previousPeers in state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PREVIOUS_PEERS', peers: [{peerId: 'p1', name: 'Alice', online: false}]}));

    await vi.waitFor(() => expect(store.getState().previousPeers).toEqual([{peerId: 'p1', name: 'Alice', online: false}]));
    await cleanup();
  });

  it('FORGET_PEER dispatch sends FORGET_PEER message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch({type: 'FORGET_PEER', peerId: 'p1'});

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m) as object)).toContainEqual({type: 'FORGET_PEER', targetPeerId: 'p1'})
    );
    await cleanup();
  });

  it('RELAY_ICE_RESTART dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch({type: 'RELAY_ICE_RESTART', targetPeerId: 'p1', sdp: 'v=restart'});

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m) as object)).toContainEqual({type: 'RELAY_ICE_RESTART', targetPeerId: 'p1', sdp: 'v=restart'})
    );
    await cleanup();
  });

  it('RELAY_ICE_RESTART_ANSWER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: 'p1', sdp: 'v=restart-answer'});

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m) as object)).toContainEqual({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: 'p1', sdp: 'v=restart-answer'})
    );
    await cleanup();
  });

  it('ICE_RESTART_RECEIVED message from server dispatches store action', async () => {
    const {store, getConn, cleanup} = await connectStore();
    const captured: import('../state/connections').ConnectionsAction[] = [];
    const origDispatch = store.dispatch;
    store.dispatch = (action) => { captured.push(action); origDispatch(action); };

    getConn().send(JSON.stringify({type: 'ICE_RESTART_RECEIVED', fromPeerId: 'p1', sdp: 'v=restart'}));

    await vi.waitFor(() =>
      expect(captured).toContainEqual(expect.objectContaining({type: 'ICE_RESTART_RECEIVED', signalingPeerId: 'p1', sdp: 'v=restart'}))
    );
    await cleanup();
  });

  it('ICE_RESTART_ANSWER_RECEIVED message from server dispatches store action', async () => {
    const {store, getConn, cleanup} = await connectStore();
    const captured: import('../state/connections').ConnectionsAction[] = [];
    const origDispatch = store.dispatch;
    store.dispatch = (action) => { captured.push(action); origDispatch(action); };

    getConn().send(JSON.stringify({type: 'ICE_RESTART_ANSWER_RECEIVED', fromPeerId: 'p1', sdp: 'v=restart-answer'}));

    await vi.waitFor(() =>
      expect(captured).toContainEqual(expect.objectContaining({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: 'p1', sdp: 'v=restart-answer'}))
    );
    await cleanup();
  });

  it('STOP_SIGNALING prevents further server events from updating state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    store.dispatch({type: 'STOP_SIGNALING'});
    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'p1', name: 'Alice'}));

    await new Promise(r => setTimeout(r, 50));
    expect(store.getState().onlinePeers).toEqual([]);
    await cleanup();
  });
});
