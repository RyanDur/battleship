export type MiddlewareFactory<S, A extends {type: string}> = (deps: {
  dispatch: (action: A) => void
  getState: () => S
}) => (next: (action: A) => void) => (action: A) => void

export type ListenerContext<S, A extends {type: string}> = {
  prevState: S
  state: S
  dispatch: (action: A) => void
  getState: () => S
}

export type ListenerFn<S, A extends {type: string}> = (action: A, context: ListenerContext<S, A>) => void

export type ListenerFactory<S, A extends {type: string}> = (deps: {
  dispatch: (action: A) => void
  getState: () => S
}) => ListenerFn<S, A>

export type Store<S, A extends {type: string}> = {
  getState: () => S
  subscribe: (fn: () => void) => () => void
  dispatch: (action: A) => void
  addListener: (fn: ListenerFn<S, A>) => () => void
}

export type Slice<FullS, K extends keyof FullS, A extends {type: string}> = {
  name: K
  initialState: FullS[K]
  reducer: (state: FullS, action: {type: string}) => FullS[K]
  middleware?: MiddlewareFactory<FullS, A>[]
  listenerFactories?: ListenerFactory<FullS, A>[]
}

export const applyMiddleware = <S, A extends {type: string}>(
  factories: MiddlewareFactory<S, A>[]
): MiddlewareFactory<S, A> =>
  (deps) => (next) =>
    factories.reduceRight((acc, factory) => factory(deps)(acc), next);

export const createStore = <FullS, A extends {type: string}>(
  slices: Slice<FullS, keyof FullS, A>[],
  listenerFactories?: ListenerFactory<FullS, A>[],
  middlewareFactory?: MiddlewareFactory<FullS, A>,
): Store<FullS, A> => {
  const initialState = slices.reduce(
    (acc, slice) => ({...acc, [slice.name]: slice.initialState}),
    {} as FullS,
  );

  const composedReducer = (state: FullS, action: {type: string}): FullS =>
    slices.reduce(
      (acc, slice) => ({...acc, [slice.name]: slice.reducer(state, action)}),
      state,
    );

  const sliceMiddleware = slices.flatMap(s => s.middleware ?? []);
  const allListenerFactories = [
    ...slices.flatMap(s => s.listenerFactories ?? []),
    ...(listenerFactories ?? []),
  ];

  let state = initialState;
  const subscribers = new Set<() => void>();
  const actionListeners = new Set<ListenerFn<FullS, A>>();

  const store: Store<FullS, A> = {
    getState: () => state,
    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    addListener: (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); },
    dispatch: (action: A) => { /* replaced below */ void action; },
  };

  const baseDispatch = (action: A) => {
    const prevState = state;
    state = composedReducer(state, action);
    subscribers.forEach(fn => fn());
    actionListeners.forEach(fn => fn(action, {prevState, state, dispatch: (a) => store.dispatch(a), getState: () => state}));
  };

  const middlewareDeps = {dispatch: (action: A) => store.dispatch(action), getState: () => state};
  const effectiveMiddleware: MiddlewareFactory<FullS, A>[] = [
    ...sliceMiddleware,
    ...(middlewareFactory ? [middlewareFactory] : []),
  ];
  store.dispatch = effectiveMiddleware.length > 0
    ? applyMiddleware(effectiveMiddleware)(middlewareDeps)(baseDispatch)
    : baseDispatch;

  const listenerDeps = {dispatch: (action: A) => store.dispatch(action), getState: () => state};
  allListenerFactories.forEach(factory => store.addListener(factory(listenerDeps)));

  return store;
};
