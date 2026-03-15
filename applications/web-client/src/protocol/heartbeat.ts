import * as Decoder from 'schemawax'
import {maybe} from '../lib/maybe'
import {tryCatch} from '../lib/result'

export type HeartbeatState =
  | {status: 'connecting'}
  | {status: 'online'}
  | {status: 'update-available'}
  | {status: 'reconnecting'; attempt: number}
  | {status: 'disconnected'}

export interface HeartbeatHandle {
  stop: () => void
  retry: () => void
}

export interface HeartbeatConfig {
  createWebSocket: (url: string) => WebSocket
  url: string
  expectedVersion: string
  heartbeatTimeout?: number
  maxRetries?: number
}

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_MAX_RETRIES = 5
const RECONNECT_DELAY = 1_000

const heartbeatDecoder = Decoder.object({
  required: {type: Decoder.literal('heartbeat'), version: Decoder.string},
})

export const startHeartbeat = (
  config: HeartbeatConfig,
  onStateChange: (state: HeartbeatState) => void
): HeartbeatHandle => {
  const {createWebSocket, url, expectedVersion} = config
  const heartbeatTimeout = config.heartbeatTimeout ?? DEFAULT_TIMEOUT
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES

  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let generation = 0

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const resetTimer = (gen: number) => {
    clearTimer()
    timer = setTimeout(() => {
      if (gen !== generation) return
      ws?.close()
    }, heartbeatTimeout)
  }

  const connect = () => {
    const gen = generation
    onStateChange(attempt === 0 ? {status: 'connecting'} : {status: 'reconnecting', attempt})

    const currentWs = createWebSocket(url)
    ws = currentWs

    currentWs.onerror = () => undefined
    currentWs.onopen = () => {
      if (gen !== generation) return
      resetTimer(gen)
    }

    currentWs.onmessage = (event: MessageEvent) => {
      if (gen !== generation) return
      tryCatch(() => JSON.parse(event.data as string), () => 'invalid json')
        .onFailure(() => console.warn('Received malformed message from server'))
        .onSuccess(parsed => {
          const data = maybe(heartbeatDecoder.decode(parsed)).orNull()
          if (!data) return
          resetTimer(gen)
          attempt = 0
          if (expectedVersion !== 'dev' && data.version !== expectedVersion) {
            onStateChange({status: 'update-available'})
          } else {
            onStateChange({status: 'online'})
          }
        })
    }

    currentWs.onclose = () => {
      if (gen !== generation) return
      clearTimer()
      attempt++
      if (attempt > maxRetries) {
        onStateChange({status: 'disconnected'})
        return
      }
      onStateChange({status: 'reconnecting', attempt})
      setTimeout(() => {
        if (gen !== generation) return
        connect()
      }, RECONNECT_DELAY)
    }
  }

  connect()

  return {
    stop: () => {
      generation++
      clearTimer()
      ws?.close()
    },
    retry: () => {
      generation++
      attempt = 0
      clearTimer()
      ws?.close()
      connect()
    },
  }
}
