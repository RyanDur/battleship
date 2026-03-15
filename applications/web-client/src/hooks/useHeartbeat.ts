import {useCallback, useEffect, useRef, useState} from 'react'
import {startHeartbeat as defaultStartHeartbeat} from '../protocol/heartbeat'
import type {HeartbeatState} from '../protocol/heartbeat'
import type {Config} from '../protocol/config'

type StartHeartbeat = typeof defaultStartHeartbeat

export const useHeartbeat = (config: Config | null, startHb: StartHeartbeat = defaultStartHeartbeat) => {
  const [state, setState] = useState<HeartbeatState>({status: 'connecting'})
  const handleRef = useRef<ReturnType<StartHeartbeat> | null>(null)

  useEffect(() => {
    if (!config) return
    const wsUrl = config.serviceUrl.replace(/^http/, 'ws') + '/ws/health'
    const h = startHb(
      {createWebSocket: (url) => new WebSocket(url), url: wsUrl, expectedVersion: config.version},
      setState
    )
    handleRef.current = h
    return () => h.stop()
  }, [config, startHb])

  const retry = useCallback(() => handleRef.current?.retry(), [])

  return {state, retry}
}
