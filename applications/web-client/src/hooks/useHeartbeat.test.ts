import {renderHook, act} from '@testing-library/react'
import {useHeartbeat} from './useHeartbeat'
import type {HeartbeatConfig, HeartbeatState} from '../protocol/heartbeat'

type FakeStart = (config: HeartbeatConfig, onStateChange: (s: HeartbeatState) => void) => {retry: () => void; stop: () => void}

const config = {version: '1.0.0', serviceUrl: 'http://localhost:8080'}

const makeFakeStart = (): {fakeStart: FakeStart; retry: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>} => {
  const retry = vi.fn()
  const stop = vi.fn()
  const fakeStart: FakeStart = vi.fn().mockReturnValue({retry, stop})
  return {fakeStart, retry, stop}
}

describe('useHeartbeat', () => {
  it('starts with connecting state', () => {
    const {result} = renderHook(() => useHeartbeat(null))

    expect(result.current.state).toEqual({status: 'connecting'})
  })

  it('does not start heartbeat when config is null', () => {
    const {fakeStart} = makeFakeStart()

    renderHook(() => useHeartbeat(null, fakeStart))

    expect(fakeStart).not.toHaveBeenCalled()
  })

  it('starts heartbeat when config is provided', () => {
    const {fakeStart} = makeFakeStart()

    renderHook(() => useHeartbeat(config, fakeStart))

    expect(fakeStart).toHaveBeenCalledOnce()
  })

  it('passes correct url and version to heartbeat', () => {
    const {fakeStart} = makeFakeStart()

    renderHook(() => useHeartbeat(config, fakeStart))

    expect(fakeStart).toHaveBeenCalledWith(
      expect.objectContaining({url: 'ws://localhost:8080/ws/health', expectedVersion: '1.0.0'}),
      expect.any(Function)
    )
  })

  it('retry calls handle retry', () => {
    const {fakeStart, retry} = makeFakeStart()
    const {result} = renderHook(() => useHeartbeat(config, fakeStart))

    act(() => result.current.retry())

    expect(retry).toHaveBeenCalledOnce()
  })

  it('retry is a no-op when config is null', () => {
    const {result} = renderHook(() => useHeartbeat(null))

    expect(() => act(() => result.current.retry())).not.toThrow()
  })

  it('reflects state changes from heartbeat', () => {
    let onStateChange: (s: HeartbeatState) => void = () => {}
    const fakeStart: FakeStart = (_config, cb) => { onStateChange = cb; return {retry: vi.fn(), stop: vi.fn()} }
    const {result} = renderHook(() => useHeartbeat(config, fakeStart))

    act(() => onStateChange({status: 'online'}))

    expect(result.current.state).toEqual({status: 'online'})
  })
})
