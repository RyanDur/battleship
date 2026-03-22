import {useEffect, useMemo, useState} from 'react';
import {BoardSetup} from './components/BoardSetup';
import {Comms} from './components/Comms';
import {DirectConnect} from './components/DirectConnect';
import {DownloadLink} from './components/DownloadLink';
import {Fleet} from './components/Fleet';
import {ServiceHealth} from './components/ServiceHealth';
import type {Config} from './protocol/config';
import type {Board} from './game/board';
import {saveBoard, loadBoard} from './protocol/boardApi';
import {fetchDownloadUrl} from './protocol/download';
import type {HeartbeatState} from './protocol/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './protocol/platform';
import {createConnectionStore, createHandlerListener, createSignalingListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './state/connectionStore';
import {startSignaling, stopSignaling} from './state/connectionActions';
import {ConnectionProvider} from './state/ConnectionProvider';

const platform = detectPlatform(navigator.userAgent);

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const;
  if (state.status === 'update-available') return 'upgrade' as const;
  return 'download' as const;
};

type SelectedPeer = {id: string; name: string | null} | null;

type Props = {config: Config};

const App = ({config}: Props) => {
  const [selectedPeer, setSelectedPeer] = useState<SelectedPeer>(null);
  const [confirmedBoard, setConfirmedBoard] = useState<Board | null>(null);

  useEffect(() => {
    loadBoard(config.serviceUrl).onSuccess(setConfirmedBoard);
  }, [config.serviceUrl]);
  const {state: heartbeat, retry} = useHeartbeat(config);

  const store = useMemo(() => {
    const signalingUrl = `${config.serviceUrl.replace(/^http/, 'ws')}/ws/signaling`;
    return createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [
        createHandlerListener({name: 'Player', createPeerConnection: () => new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]})}),
        createSignalingListener({config: {createWebSocket: (url) => new WebSocket(url), sessionUrl: `${config.serviceUrl}/session`, url: signalingUrl, name: 'Player'}}),
      ],
    );
  }, [config]);

  useEffect(() => {
    store.dispatch(startSignaling());
    return () => store.dispatch(stopSignaling());
  }, [store]);

  return (
    <>
      <header className="hud-header">
        <h1 className="hud-title">Battleship</h1>
        <ServiceHealth state={heartbeat} onRetry={retry}/>
        <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
      </header>
      <ConnectionProvider store={store}>
        <Fleet onSelectPeer={(id, name) => setSelectedPeer({id, name})}/>
        <main className="hud-main">
          {!confirmedBoard && (
            <BoardSetup onConfirm={board => {
              saveBoard(config.serviceUrl, board).onSuccess(() => setConfirmedBoard(board));
            }}/>
          )}
        </main>
        <Comms peerId={selectedPeer?.id ?? null} peerName={selectedPeer?.name ?? null}/>
        <footer className="hud-footer">
          <DirectConnect serviceOnline={heartbeat.status === 'online'}/>
          <small className="app-version">{config.version}</small>
        </footer>
      </ConnectionProvider>
    </>
  );
};

export {App};
