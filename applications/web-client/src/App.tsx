import {useEffect, useMemo, useState} from 'react';
import {BoardSetup} from './game/BoardSetup';
import {Comms} from './connections/Comms';
import {DirectConnect} from './connections/DirectConnect';
import {DownloadLink} from './connections/DownloadLink';
import {Fleet} from './connections/Fleet';
import {Game} from './game/GameView';
import {GameLobby} from './game/GameLobby';
import {ServiceHealth} from './connections/ServiceHealth';
import type {Config} from './connections/config';
import {fetchDownloadUrl} from './connections/download';
import type {HeartbeatState} from './connections/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './connections/platform';
import {createConnectionStore, createHandlerListener, createSignalingListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connections/connectionStore';
import {startSignaling, stopSignaling, sendToPeer} from './connections/connectionActions';
import {ConnectionProvider} from './connections/ConnectionProvider';
import {selectSignalingToPeer, selectPeerToSignaling} from './connections/connectionSelectors';
import {clearP2pGame, saveBoard, startGame} from './game/gameActions';
import {selectBoard, selectBoardLoading, selectP2pGame, selectGameView} from './game/gameSelectors';
import {useGameState, useGameStore} from './game/useGame';
import {createGameStore, createAiGameListenerFactory, createOfflineFallbackListenerFactory, createSaveOnShotListenerFactory, createReconnectListenerFactory, createGameCommandListenerFactory, createSignalingBridgeListenerFactory} from './game/gameStore';
import {initialGameState} from './game/game';
import {GameProvider} from './game/GameProvider';
import {createConnectionPort} from './connections/connectionPort';

const platform = detectPlatform(navigator.userAgent);

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const;
  if (state.status === 'update-available') return 'upgrade' as const;
  return 'download' as const;
};

type SelectedPeer = {id: string; name: string | null} | null;

type Props = {config: Config};

const AppMain = () => {
  const board = useGameState(selectBoard);
  const boardLoading = useGameState(selectBoardLoading);
  const p2pGame = useGameState(selectP2pGame);
  const gameView = useGameState(selectGameView);
  const gameStore = useGameStore();
  const [settingUpBoard, setSettingUpBoard] = useState(false);

  if (boardLoading) return null;
  if (!p2pGame && !board) return <BoardSetup onConfirm={b => gameStore.dispatch(saveBoard(b))}/>;
  if (settingUpBoard) return <BoardSetup onConfirm={b => { gameStore.dispatch(saveBoard(b)); setSettingUpBoard(false); }}/>;
  if (p2pGame && (p2pGame.phase === 'placing' || p2pGame.phase === 'selecting-turn')) return <GameLobby onSetupBoard={() => setSettingUpBoard(true)}/>;
  if (gameView) return <Game onNewGame={() => p2pGame ? gameStore.dispatch(clearP2pGame()) : gameStore.dispatch(startGame())}/>;
  return <button className="control" onClick={() => gameStore.dispatch(startGame())}>Play vs AI</button>;
};

const App = ({config}: Props) => {
  const [selectedPeer, setSelectedPeer] = useState<SelectedPeer>(null);
  const {state: heartbeat, retry} = useHeartbeat(config);

  const {store, gameStore} = useMemo(() => {
    const signalingUrl = `${config.serviceUrl.replace(/^http/, 'ws')}/ws/signaling`;
    let gs: ReturnType<typeof createGameStore> | null = null;
    const {port, emit: portEmit} = createConnectionPort({
      sendToPeer: (peerId, message) => connectionStore.dispatch(sendToPeer(peerId, message as Record<string, unknown>)),
      sendToServer: () => {},
    });
    const connectionStore = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [
        createHandlerListener({
          name: 'Player',
          createPeerConnection: () => new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]}),
          portEmit,
          getGameState: () => gs?.getState() ?? initialGameState,
          dispatchToGame: (action) => gs?.dispatch(action),
        }),
        createSignalingListener({config: {createWebSocket: (url) => new WebSocket(url), sessionUrl: `${config.serviceUrl}/session`, url: signalingUrl, name: 'Player'}, portEmit}),
      ],
    );
    gs = createGameStore({
      port,
      listenerFactories: [createAiGameListenerFactory, createOfflineFallbackListenerFactory, createSaveOnShotListenerFactory, createReconnectListenerFactory, createGameCommandListenerFactory, createSignalingBridgeListenerFactory],
      translatePeerId: (signalingId) => selectSignalingToPeer(connectionStore.getState())[signalingId],
      dispatchToConnection: (action) => connectionStore.dispatch(action),
      getPeerToSignaling: () => selectPeerToSignaling(connectionStore.getState()),
    });
    return {store: connectionStore, gameStore: gs};
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
        <GameProvider store={gameStore}>
          <Fleet onSelectPeer={(id, name) => setSelectedPeer({id, name})}/>
          <main className="hud-main">
            <AppMain/>
          </main>
          <Comms peerId={selectedPeer?.id ?? null} peerName={selectedPeer?.name ?? null}/>
          <footer className="hud-footer">
            <DirectConnect serviceOnline={heartbeat.status === 'online'}/>
            <small className="app-version">{config.version}</small>
          </footer>
        </GameProvider>
      </ConnectionProvider>
    </>
  );
};

export {App};
