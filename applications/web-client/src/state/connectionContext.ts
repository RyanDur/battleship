import {createContext} from 'react'
import type {ConnectionStore} from './connectionStore'

export const ConnectionContext = createContext<ConnectionStore | null>(null)
