import {createContext} from 'react';
import type {AppStore} from './store';

export const storeContext = createContext<AppStore | null>(null);
