import {useContext, useEffect, useState} from 'react';
import {storeContext} from './storeContext';
import type {CombinedState, CombinedAction} from './store';

const useStore = () => {
  const store = useContext(storeContext);
  if (!store) throw new Error('useDispatch/useSelector must be used within StoreProvider');
  return store;
};

export const useDispatch = (): ((action: CombinedAction) => void) => useStore().dispatch;

export const useSelector = <T,>(selector: (state: CombinedState) => T): T => {
  const store = useStore();
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), [store, selector]);
  return value;
};
