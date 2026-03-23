import type {ConnectionsState, GameView} from './connections';

export const selectFlow = (state: ConnectionsState) => state.flow;
export const selectPeers = (state: ConnectionsState) => state.peers;
export const selectPendingIntroductions = (state: ConnectionsState) => state.pendingIntroductions;
export const selectOnlinePeers = (state: ConnectionsState) => state.onlinePeers;
export const selectPreviousPeers = (state: ConnectionsState) => state.previousPeers;
export const selectPeerConnectionHealth = (state: ConnectionsState) => state.peerConnectionHealth;
export const selectHandlerState = (state: ConnectionsState) => state.handlerState;
export const selectOffererPeerIds = (state: ConnectionsState) => state.handlerState.offererPeerIds;
export const selectPeerToSignaling = (state: ConnectionsState) => state.handlerState.peerToSignaling;
export const selectSignalingToPeer = (state: ConnectionsState) => state.handlerState.signalingToPeer;
export const selectIceRestartAttempts = (state: ConnectionsState) => state.handlerState.iceRestartAttempts;
export const selectIntroChannels = (state: ConnectionsState) => state.handlerState.introChannels;
export const selectIntroConnections = (state: ConnectionsState) => state.handlerState.introConnections;

export const selectIsCreatingOffer = (state: ConnectionsState) =>
  state.flow.phase === 'creating' || state.flow.phase === 'encoding-offer';

export const selectMessages = (state: ConnectionsState) => state.messages;
export const selectBoard = (state: ConnectionsState) => state.board;
export const selectBoardLoading = (state: ConnectionsState) => state.boardLoading;
export const selectGameState = (state: ConnectionsState) => state.gameState;
export const selectP2pGame = (state: ConnectionsState) => state.p2pGame;

export const selectAnnouncement = (state: ConnectionsState): string => {
  if (state.p2pGame) return state.p2pGame.announcement;
  return state.gameState?.announcement ?? '';
};

export const selectGameView = (state: ConnectionsState): GameView | null => {
  const {gameState, p2pGame, peers} = state;
  if (p2pGame && (p2pGame.phase === 'my-turn' || p2pGame.phase === 'their-turn' || p2pGame.phase === 'game-over')) {
    const opponentName = peers.find(p => p.id === p2pGame.opponentId)?.name ?? 'Opponent';
    const phase = p2pGame.phase === 'game-over'
      ? (p2pGame.winner === 'me' ? 'won' : 'lost')
      : p2pGame.phase;
    return {myShots: p2pGame.myShots, opponentShots: p2pGame.opponentShots, phase, opponentName};
  }
  if (gameState) {
    const phase = gameState.phase === 'player-won' ? 'won'
      : gameState.phase === 'computer-won' ? 'lost'
      : gameState.phase === 'player-turn' ? 'my-turn'
      : 'their-turn';
    return {myShots: gameState.playerShots, opponentShots: gameState.aiShots, phase, opponentName: 'Computer'};
  }
  return null;
};
