import {createContext} from 'react';
import type {GameStore} from './gameStore';

export const GameContext = createContext<GameStore | null>(null);
