// @vitest-environment node
import {createConnectionStore, createSignalingListener} from './connectionStore';
import {createStubServer} from '../test/stubServer';
import {makeWebSocket} from '../test/makeWebSocket';
import type {WsConnection} from '../test/stubServer';
import {startSignaling, stopSignaling, relayOffer, relayAnswer, forgetPeer, relayIceRestart, relayIceRestartAnswer, shareEmail, stopSharingEmail, updateEmail, savePeerEmail} from './connectionActions';
import {selectOnlinePeers, selectPreviousPeers} from './connectionSelectors';

const connectStore = async (serverSetup: (conn: WsConnection) => void = () => undefined) => {
  let wsConn: WsConnection | undefined;
  const server = await createStubServer({
    routes: {'GET /session': (_req, res) => { res.writeHead(200); res.end(); }},
    ws: {'/ws/signaling': conn => { wsConn = conn; serverSetup(conn); }},
  });

  const store = createConnectionStore(undefined, [
    createSignalingListener({
      config: {
        createWebSocket: makeWebSocket,
        sessionUrl: `${server.url}/session`,
        url: `${server.url.replace('http://', 'ws://')}/ws/signaling`,
        name: 'Player',
      },
    }),
  ]);

  store.dispatch(startSignaling());
  await vi.waitFor(() => expect(wsConn).toBeDefined());

  const cleanup = async () => {
    store.dispatch(stopSignaling());
    await server.close();
  };

  return {store, getConn: () => wsConn!, cleanup};
};

describe('createSignalingMiddleware (server)', () => {
  it('PEERS message updates onlinePeers in state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEERS', peers: [{peerId: 'p1', name: 'Alice'}]}));

    await vi.waitFor(() => expect(selectOnlinePeers(store.getState())).toEqual([{peerId: 'p1', name: 'Alice'}]));
    await cleanup();
  });

  it('PEER_JOINED message adds to onlinePeers', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'p1', name: 'Alice'}));

    await vi.waitFor(() => expect(selectOnlinePeers(store.getState())).toEqual([{peerId: 'p1', name: 'Alice'}]));
    await cleanup();
  });

  it('PEER_LEFT message removes from onlinePeers', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PEERS', peers: [{peerId: 'p1', name: 'Alice'}]}));
    await vi.waitFor(() => expect(selectOnlinePeers(store.getState())).toHaveLength(1));
    getConn().send(JSON.stringify({type: 'PEER_LEFT', peerId: 'p1'}));

    await vi.waitFor(() => expect(selectOnlinePeers(store.getState())).toEqual([]));
    await cleanup();
  });

  it('RELAY_OFFER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(relayOffer('p1', 'v=0'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'RELAY_OFFER', targetPeerId: 'p1', sdp: 'v=0'})
    );
    await cleanup();
  });

  it('RELAY_ANSWER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(relayAnswer('p1', 'v=answer'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'RELAY_ANSWER', targetPeerId: 'p1', sdp: 'v=answer'})
    );
    await cleanup();
  });

  it('PREVIOUS_PEERS message updates previousPeers in state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PREVIOUS_PEERS', peers: [{peerId: 'p1', name: 'Alice', online: false}]}));

    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())).toEqual([{peerId: 'p1', name: 'Alice', online: false}]));
    await cleanup();
  });

  it('FORGET_PEER dispatch sends FORGET_PEER message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(forgetPeer('p1'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'FORGET_PEER', targetPeerId: 'p1'})
    );
    await cleanup();
  });

  it('RELAY_ICE_RESTART dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(relayIceRestart('p1', 'v=restart'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'RELAY_ICE_RESTART', targetPeerId: 'p1', sdp: 'v=restart'})
    );
    await cleanup();
  });

  it('RELAY_ICE_RESTART_ANSWER dispatch sends message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(relayIceRestartAnswer('p1', 'v=restart-answer'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: 'p1', sdp: 'v=restart-answer'})
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

  it('EMAIL_SHARED message updates email on matching previous peer', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PREVIOUS_PEERS', peers: [{peerId: 'p1', name: 'Alice', online: false}]}));
    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())).toHaveLength(1));

    getConn().send(JSON.stringify({type: 'EMAIL_SHARED', fromPeerId: 'p1', email: 'alice@example.com'}));

    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())[0]).toEqual({peerId: 'p1', name: 'Alice', online: false, email: 'alice@example.com'}));
    await cleanup();
  });

  it('EMAIL_REVOKED message clears email from matching previous peer', async () => {
    const {store, getConn, cleanup} = await connectStore();

    getConn().send(JSON.stringify({type: 'PREVIOUS_PEERS', peers: [{peerId: 'p1', name: 'Alice', online: false, email: 'alice@example.com'}]}));
    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())[0]?.email).toBe('alice@example.com'));

    getConn().send(JSON.stringify({type: 'EMAIL_REVOKED', fromPeerId: 'p1'}));

    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())[0]?.email).toBeUndefined());
    await cleanup();
  });

  it('SHARE_EMAIL dispatch sends SHARE_EMAIL message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(shareEmail('p1'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'SHARE_EMAIL', targetPeerId: 'p1'})
    );
    await cleanup();
  });

  it('STOP_SHARING_EMAIL dispatch sends STOP_SHARING_EMAIL message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(stopSharingEmail('p1'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'STOP_SHARING_EMAIL', targetPeerId: 'p1'})
    );
    await cleanup();
  });

  it('UPDATE_EMAIL dispatch sends UPDATE_EMAIL message to server', async () => {
    const received: string[] = [];
    const {store, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    store.dispatch(updateEmail('new@example.com'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'UPDATE_EMAIL', email: 'new@example.com'})
    );
    await cleanup();
  });

  it('SAVE_PEER_EMAIL dispatch sends message to server and updates state', async () => {
    const received: string[] = [];
    const {store, getConn, cleanup} = await connectStore(conn => conn.onMessage(msg => received.push(msg)));

    getConn().send(JSON.stringify({type: 'PREVIOUS_PEERS', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));
    await vi.waitFor(() => expect(selectPreviousPeers(store.getState())).toHaveLength(1));

    store.dispatch(savePeerEmail('p1', 'bob@example.com'));

    await vi.waitFor(() =>
      expect(received.map(m => JSON.parse(m))).toContainEqual({type: 'SAVE_PEER_EMAIL', targetPeerId: 'p1', email: 'bob@example.com'})
    );
    expect(selectPreviousPeers(store.getState())[0]).toEqual({peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'});
    await cleanup();
  });

  it('STOP_SIGNALING prevents further server events from updating state', async () => {
    const {store, getConn, cleanup} = await connectStore();

    store.dispatch(stopSignaling());
    getConn().send(JSON.stringify({type: 'PEER_JOINED', peerId: 'p1', name: 'Alice'}));

    await new Promise(r => setTimeout(r, 50));
    expect(selectOnlinePeers(store.getState())).toEqual([]);
    await cleanup();
  });
});
