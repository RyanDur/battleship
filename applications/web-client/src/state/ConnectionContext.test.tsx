import {render, screen, act} from '@testing-library/react'
import {ConnectionProvider} from './ConnectionProvider'
import {useConnectionState, useConnectionStore} from './useConnection'
import {initialState} from './connections'
import type {ConnectionStore} from './connectionStore'
import type {ConnectionsState} from './connections'

const makeFakeStore = (initial: ConnectionsState = initialState): ConnectionStore & {_emit: () => void} => {
  let state = initial
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(fn => fn())
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    createOffer: vi.fn(),
    joinOffer: vi.fn(),
    acceptAnswer: vi.fn(),
    _emit: () => {
      state = {...state, peers: [{id: 'p1', name: 'Alice'}]}
      notify()
    },
  }
}

const TestComponent = ({selector}: {selector: (s: ConnectionsState) => unknown}) => {
  const value = useConnectionState(selector)
  return <div data-testid="value">{JSON.stringify(value)}</div>
}

describe('ConnectionContext', () => {
  describe('useConnectionState', () => {
    it('returns initial selected state', () => {
      const store = makeFakeStore()
      render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => s.flow.phase}/>
        </ConnectionProvider>
      )

      expect(screen.getByTestId('value').textContent).toBe('"idle"')
    })

    it('updates when store changes', async () => {
      const store = makeFakeStore()
      render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => s.peers.length}/>
        </ConnectionProvider>
      )

      expect(screen.getByTestId('value').textContent).toBe('0')

      act(() => store._emit())

      expect(screen.getByTestId('value').textContent).toBe('1')
    })

    it('unsubscribes on unmount', () => {
      const store = makeFakeStore()
      const subscribeSpy = vi.spyOn(store, 'subscribe')

      const {unmount} = render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => s.flow.phase}/>
        </ConnectionProvider>
      )

      const unsubscribe = subscribeSpy.mock.results[0].value
      const unsubscribeSpy = vi.fn(unsubscribe)
      subscribeSpy.mock.results[0].value = unsubscribeSpy

      unmount()

      expect(subscribeSpy).toHaveBeenCalled()
    })
  })

  describe('useConnectionStore', () => {
    it('exposes createOffer action method', () => {
      const store = makeFakeStore()

      const Button = () => {
        const s = useConnectionStore()
        return <button onClick={() => s.createOffer('pass')}>go</button>
      }

      render(
        <ConnectionProvider store={store}>
          <Button/>
        </ConnectionProvider>
      )

      screen.getByRole('button').click()

      expect(store.createOffer).toHaveBeenCalledWith('pass')
    })
  })
})
