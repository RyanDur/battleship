import type {ReactNode} from 'react'
import {ConnectionContext} from './connectionContext'
import type {ConnectionStore} from './connectionStore'

export const ConnectionProvider = ({store, children}: {store: ConnectionStore; children: ReactNode}) => (
  <ConnectionContext.Provider value={store}>
    {children}
  </ConnectionContext.Provider>
)
