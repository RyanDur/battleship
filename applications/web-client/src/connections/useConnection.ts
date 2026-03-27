import {useContext, useEffect, useState} from 'react';
import {ConnectionContext} from './connectionContext';
import type {ConnectionStore} from './connectionStore';
import type {ConnectionsState} from './connections';

export const useConnectionStore = (): ConnectionStore => {
  const store = useContext(ConnectionContext);
  if (!store) throw new Error('useConnectionStore must be used within ConnectionProvider');
  return store;
};

export const useConnectionState = <T,>(selector: (state: ConnectionsState) => T): T => {
  const store = useConnectionStore();
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), [store, selector]);
  return value;
};
