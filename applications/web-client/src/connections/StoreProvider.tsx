import type {ReactNode} from 'react';
import {storeContext} from './storeContext';
import type {AppStore} from './store';

export const StoreProvider = ({store, children}: {store: AppStore; children: ReactNode}) => (
  <storeContext.Provider value={store}>
    {children}
  </storeContext.Provider>
);
