import type {ReactNode} from 'react';
import {GameContext} from './gameContext';
import type {GameStore} from './gameStore';

export const GameProvider = ({store, children}: {store: GameStore; children: ReactNode}) => (
  <GameContext.Provider value={store}>
    {children}
  </GameContext.Provider>
);
