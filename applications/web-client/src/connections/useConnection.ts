import {useContext, useEffect, useState} from 'react';
import {ConnectionContext} from './connectionContext';
import type {ConnectionStore, CombinedState} from './connectionStore';

export const useConnectionStore = (): ConnectionStore => {
  const store = useContext(ConnectionContext);
  if (!store) throw new Error('useConnectionStore must be used within ConnectionProvider');
  return store;
};

export const useConnectionState = <T,>(selector: (state: CombinedState) => T): T => {
  const store = useConnectionStore();
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), [store, selector]);
  return value;
};
