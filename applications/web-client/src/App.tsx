import {useEffect, useMemo, useState} from 'react';
import {BoardSetup} from './components/BoardSetup';
import {Comms} from './components/Comms';
import {DirectConnect} from './components/DirectConnect';
import {DownloadLink} from './components/DownloadLink';
import {Fleet} from './components/Fleet';
import {Game} from './components/Game';
import {ServiceHealth} from './components/ServiceHealth';
import type {Config} from './protocol/config';
import {fetchDownloadUrl} from './protocol/download';
import type {HeartbeatState} from './protocol/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './protocol/platform';
import {createConnectionStore, createHandlerListener, createSignalingListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './state/connectionStore';
import {startSignaling, stopSignaling, saveBoard, startGame} from './state/connectionActions';
import {ConnectionProvider} from './state/ConnectionProvider';
import {useConnectionState, useConnectionStore} from './state/useConnection';
import {selectBoard, selectBoardLoading, selectGameState} from './state/connectionSelectors';

const platform = detectPlatform(navigator.userAgent);

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const;
  if (state.status === 'update-available') return 'upgrade' as const;
  return 'download' as const;
};

type SelectedPeer = {id: string; name: string | null} | null;

type Props = {config: Config};

const AppMain = () => {
  const board = useConnectionState(selectBoard);
  const boardLoading = useConnectionState(selectBoardLoading);
  const gameState = useConnectionState(selectGameState);
  const store = useConnectionStore();

  if (boardLoading) return null;
  if (!board) return <BoardSetup onConfirm={b => store.dispatch(saveBoard(b))}/>;
  if (!gameState) return <button className="control" onClick={() => store.dispatch(startGame())}>Play vs AI</button>;
  return <Game onNewGame={() => store.dispatch(startGame())}/>;
};

const App = ({config}: Props) => {
  const [selectedPeer, setSelectedPeer] = useState<SelectedPeer>(null);
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
          <AppMain/>
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
