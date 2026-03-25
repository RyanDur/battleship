import {useContext, useEffect, useState} from 'react';
import {GameContext} from './gameContext';
import type {GameStore} from './gameStore';
import type {GameState} from './game';

export const useGameStore = (): GameStore => {
  const store = useContext(GameContext);
  if (!store) throw new Error('useGameStore must be used within GameProvider');
  return store;
};

export const useGameState = <T,>(selector: (state: GameState) => T): T => {
  const store = useGameStore();
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), [store, selector]);
  return value;
};
