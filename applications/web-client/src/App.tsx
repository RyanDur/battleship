import {useEffect, useMemo, useState} from 'react';
import {Connections} from './components/Connections';
import {DownloadLink} from './components/DownloadLink';
import {ServiceHealth} from './components/ServiceHealth';
import {loadConfig} from './protocol/config';
import {fetchDownloadUrl} from './protocol/download';
import type {HeartbeatState} from './protocol/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './protocol/platform';
import {createConnectionStore, createHandlerMiddleware, encodingMiddleware, codecMiddleware, createSignalingMiddleware, applyMiddleware} from './state/connectionStore';
import {ConnectionProvider} from './state/ConnectionProvider';

const platform = detectPlatform(navigator.userAgent);

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const;
  if (state.status === 'update-available') return 'upgrade' as const;
  return 'download' as const;
};

const App = () => {
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadConfig>> | null>(null);
  const {state: heartbeat, retry} = useHeartbeat(config);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const store = useMemo(() => {
    if (!config) return null;
    const signalingUrl = `${config.serviceUrl.replace(/^http/, 'ws')}/ws/signaling`;
    return createConnectionStore(applyMiddleware([
      createHandlerMiddleware({name: 'Player', createPeerConnection: () => new RTCPeerConnection()}),
      encodingMiddleware,
      codecMiddleware,
      createSignalingMiddleware({
        config: {
          createWebSocket: (url) => new WebSocket(url),
          sessionUrl: `${config.serviceUrl}/session`,
          url: signalingUrl,
          name: 'Player',
        },
      }),
    ]));
  }, [config]);

  useEffect(() => {
    if (!store) return;
    store.dispatch({type: 'START_SIGNALING'});
    return () => store.dispatch({type: 'STOP_SIGNALING'});
  }, [store]);

  return (
    <main>
      <h1>Battleship</h1>
      <ServiceHealth state={heartbeat} onRetry={retry}/>
      <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
      {store && (
        <ConnectionProvider store={store}>
          <Connections serviceOnline={heartbeat.status === 'online'}/>
        </ConnectionProvider>
      )}
    </main>
  );
};

export {App};
