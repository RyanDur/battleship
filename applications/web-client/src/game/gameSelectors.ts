import type {GameState, GameView} from './game';

export const selectBoard = (state: GameState) => state.board;
export const selectBoardLoading = (state: GameState) => state.boardLoading;
export const selectAiGameState = (state: GameState) => state.aiGameState;
export const selectP2pGame = (state: GameState) => state.p2pGame;
export const selectOpponentNames = (state: GameState) => state.opponentNames;
export const selectOffererPeerIds = (state: GameState) => state.offererPeerIds;

export const selectAnnouncement = (state: GameState): string => {
  if (state.p2pGame) return state.p2pGame.announcement;
  return state.aiGameState?.announcement ?? '';
};

export const selectGameView = (state: GameState): GameView | null => {
  const {aiGameState, p2pGame, opponentNames} = state;
  if (p2pGame && (p2pGame.phase === 'my-turn' || p2pGame.phase === 'their-turn' || p2pGame.phase === 'game-over' || p2pGame.phase === 'disconnected' || p2pGame.phase === 'state-mismatch')) {
    const opponentName = opponentNames[p2pGame.opponentId] ?? 'Opponent';
    const phase = p2pGame.phase === 'game-over'
      ? (p2pGame.winner === 'me' ? 'won' : 'lost')
      : p2pGame.phase === 'disconnected' ? 'disconnected'
      : p2pGame.phase === 'state-mismatch' ? 'state-mismatch'
      : p2pGame.phase;
    return {myShots: p2pGame.myShots, opponentShots: p2pGame.opponentShots, phase, opponentName};
  }
  if (aiGameState) {
    const phase = aiGameState.phase === 'player-won' ? 'won'
      : aiGameState.phase === 'computer-won' ? 'lost'
      : aiGameState.phase === 'player-turn' ? 'my-turn'
      : 'their-turn';
    return {myShots: aiGameState.playerShots, opponentShots: aiGameState.aiShots, phase, opponentName: 'Computer'};
  }
  return null;
};
