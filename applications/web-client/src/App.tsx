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
import {downloadUrl} from './connections/download';
import type {HeartbeatState} from './transport/heartbeat';
import {useHeartbeat} from './hooks/useHeartbeat';
import {detectPlatform} from './connections/platform';
import {createAppStore, createHandlerListener, createSignalingListener, createTransportDeliveryListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connections/store';
import {sendToPeer} from './connections/connectionActions';
import {startSignaling, stopSignaling, deliverToServer} from './transport/transportActions';
import type {ConnectionEvent} from './transport/connectionPort';
import {StoreProvider} from './connections/StoreProvider';
import {selectSignalingToPeer, selectPeerToSignaling} from './transport/transportSelectors';
import {clearP2pGame, saveBoard, startGame} from './game/gameActions';
import {selectBoard, selectBoardLoading, selectP2pGame, selectGameView, selectAnnouncement} from './game/gameSelectors';
import {useGameState, useGameStore} from './game/useGame';
import {createGameStore, createAiGameListenerFactory, createOfflineFallbackListenerFactory, createSaveOnShotListenerFactory, createReconnectListenerFactory, createGameCommandListenerFactory, createServerBridgeListenerFactory} from './game/gameStore';
import {GameProvider} from './game/GameProvider';

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
  const announcement = useGameState(selectAnnouncement);
  const gameStore = useGameStore();
  const [settingUpBoard, setSettingUpBoard] = useState(false);

  if (boardLoading) return null;
  if (!p2pGame && !board) return <BoardSetup onConfirm={b => gameStore.dispatch(saveBoard(b))}/>;
  if (settingUpBoard) return <BoardSetup onConfirm={b => { gameStore.dispatch(saveBoard(b)); setSettingUpBoard(false); }}/>;
  if (p2pGame && (p2pGame.phase === 'placing' || p2pGame.phase === 'selecting-turn')) return <GameLobby onSetupBoard={() => setSettingUpBoard(true)}/>;
  if (gameView) return <Game onNewGame={() => p2pGame ? gameStore.dispatch(clearP2pGame()) : gameStore.dispatch(startGame())}/>;
  return (
    <>
      {announcement && <p role="status" className="app-announcement">{announcement}</p>}
      <button className="control" onClick={() => gameStore.dispatch(startGame())}>Play vs AI</button>
    </>
  );
};

const App = ({config}: Props) => {
  const [selectedPeer, setSelectedPeer] = useState<SelectedPeer>(null);
  const {state: heartbeat, retry} = useHeartbeat(config);

  const {store, gameStore} = useMemo(() => {
    const signalingUrl = `${config.serviceUrl.replace(/^http/, 'ws')}/ws/signaling`;
    const serverHandle: {send: ((message: unknown) => void) | null} = {send: null};

    const peerMessageHandlers = new Set<(peerId: string, data: unknown) => void>();
    const peerConnectedHandlers = new Set<(peerId: string, isOfferer: boolean) => void>();
    const peerNamedHandlers = new Set<(peerId: string, name: string) => void>();
    const peerDisconnectedHandlers = new Set<(peerId: string) => void>();
    const serverMessageHandlers = new Set<(data: unknown) => void>();

    const portEmit = (event: ConnectionEvent) => {
      if (event.type === 'PEER_CONNECTED') peerConnectedHandlers.forEach(h => h(event.peerId, event.isOfferer));
      if (event.type === 'PEER_NAMED') peerNamedHandlers.forEach(h => h(event.peerId, event.name));
      if (event.type === 'PEER_DISCONNECTED') peerDisconnectedHandlers.forEach(h => h(event.peerId));
      if (event.type === 'SERVER_MESSAGE') serverMessageHandlers.forEach(h => h(event.data));
    };

    const connectionStore = createAppStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [
        createHandlerListener({
          name: 'Player',
          createPeerConnection: () => new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]}),
          portEmit,
        }),
        createSignalingListener({config: {createWebSocket: (url) => new WebSocket(url), sessionUrl: `${config.serviceUrl}/session`, url: signalingUrl, name: 'Player'}, portEmit, onReady: (handle) => { serverHandle.send = handle.send; }}),
        createTransportDeliveryListener((message) => serverHandle.send?.(message)),
      ],
    );

    connectionStore.addListener((action) => {
      if (action.type === 'PEER_MESSAGE_RECEIVED') peerMessageHandlers.forEach(h => h(action.peerId, action.data));
    });

    const gameStore = createGameStore({
      sendToPeer: (peerId, message) => connectionStore.dispatch(sendToPeer(peerId, message as Record<string, unknown>)),
      sendToServer: (message) => connectionStore.dispatch(deliverToServer(message)),
      listenerFactories: [createAiGameListenerFactory, createOfflineFallbackListenerFactory, createSaveOnShotListenerFactory, createReconnectListenerFactory, createGameCommandListenerFactory, createServerBridgeListenerFactory],
      translatePeerId: (signalingId) => selectSignalingToPeer(connectionStore.getState())[signalingId],
      getPeerToSignaling: () => selectPeerToSignaling(connectionStore.getState()),
      onPeerMessage: (handler) => peerMessageHandlers.add(handler),
      onPeerConnected: (handler) => peerConnectedHandlers.add(handler),
      onPeerNamed: (handler) => peerNamedHandlers.add(handler),
      onPeerDisconnected: (handler) => peerDisconnectedHandlers.add(handler),
      onServerMessage: (handler) => serverMessageHandlers.add(handler),
    });
    return {store: connectionStore, gameStore};
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
        <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={(p) => downloadUrl(p, config.version)}/>
      </header>
      <StoreProvider store={store}>
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
      </StoreProvider>
    </>
  );
};

export {App};
