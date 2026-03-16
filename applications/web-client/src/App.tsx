import {useEffect, useState} from 'react';
import {Connections} from './components/Connections';
import {DownloadLink} from './components/DownloadLink';
import {ServiceHealth} from './components/ServiceHealth';
import {loadConfig} from './protocol/config';
import {encodeConnectionCode, decodeConnectionCode} from './protocol/connection-code';
import {fetchDownloadUrl} from './protocol/download';
import type {HeartbeatState} from './protocol/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './protocol/platform';
import {createConnectionStore, createHandlerMiddleware, createEncodingMiddleware, createCodecMiddleware} from './state/connectionStore';
import {ConnectionProvider} from './state/ConnectionProvider';
import {createPeerHandler} from './workers/connection.handler';
import {startSignaling} from './protocol/signaling';

const platform = detectPlatform(navigator.userAgent);

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const;
  if (state.status === 'update-available') return 'upgrade' as const;
  return 'download' as const;
};

const App = () => {
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadConfig>> | null>(null);
  const {state: heartbeat, retry} = useHeartbeat(config);
  const [store] = useState(() => {
    const s = createConnectionStore();
    s.applyMiddleware(createHandlerMiddleware({
      createHandler: (emit) => createPeerHandler({name: 'Player', createPeerConnection: () => new RTCPeerConnection(), emit}),
      dispatch: s.dispatch,
    }));
    s.applyMiddleware(createEncodingMiddleware({encodeCode: encodeConnectionCode, getState: s.getState, dispatch: s.dispatch}));
    s.applyMiddleware(createCodecMiddleware({decodeCode: decodeConnectionCode, getState: s.getState, dispatch: s.dispatch}));
    return s;
  });

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!config) return;
    const signalingUrl = `${config.serviceUrl.replace(/^http/, 'ws')}/ws/signaling`;
    const signaling = startSignaling({
      createWebSocket: (url) => new WebSocket(url),
      sessionUrl: `${config.serviceUrl}/session`,
      url: signalingUrl,
      name: 'Player',
    }, (event) => {
      if (event.type === 'PEERS') store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: event.peers});
      else if (event.type === 'PEER_JOINED') store.dispatch({type: 'ONLINE_PEER_JOINED', peerId: event.peerId, name: event.name});
      else if (event.type === 'PEER_LEFT') store.dispatch({type: 'ONLINE_PEER_LEFT', peerId: event.peerId});
      else if (event.type === 'OFFER_RECEIVED') store.dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: event.fromPeerId, name: event.name, sdp: event.sdp});
      else if (event.type === 'ANSWER_RECEIVED') store.dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: event.fromPeerId, sdp: event.sdp});
    });
    const unsubscribe = store.applyMiddleware((action) => {
      if (action.type === 'RELAY_OFFER') signaling.send({type: 'RELAY_OFFER', targetPeerId: action.targetPeerId, sdp: action.sdp});
      else if (action.type === 'RELAY_ANSWER') signaling.send({type: 'RELAY_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp});
    });
    return () => { signaling.stop(); unsubscribe(); };
  }, [config, store]);

  return (
    <main>
      <h1>Battleship</h1>
      <ConnectionProvider store={store}>
        <ServiceHealth state={heartbeat} onRetry={retry}/>
        <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
        <Connections serviceOnline={heartbeat.status === 'online'}/>
      </ConnectionProvider>
    </main>
  );
};

export {App};
