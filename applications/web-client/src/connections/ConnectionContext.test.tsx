import {render, screen, act} from '@testing-library/react';
import {ConnectionProvider} from './ConnectionProvider';
import {useConnectionState, useConnectionStore} from './useConnection';
import {createConnectionStore} from './connectionStore';
import type {CombinedState} from './connectionStore';
import {createOffer} from '../transport/transportActions';
import {peerConnected, peerNamed} from './connectionActions';
import {selectFlow} from '../transport/transportSelectors';
import {selectPeers} from './connectionSelectors';

const TestComponent = ({selector}: {selector: (s: CombinedState) => unknown}) => {
  const value = useConnectionState(selector);
  return <div data-testid="value">{JSON.stringify(value)}</div>;
};

describe('ConnectionContext', () => {
  describe('useConnectionState', () => {
    it('returns initial selected state', () => {
      const store = createConnectionStore();
      render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => selectFlow(s).phase}/>
        </ConnectionProvider>
      );

      expect(screen.getByTestId('value').textContent).toBe('"idle"');
    });

    it('updates when store changes', async () => {
      const store = createConnectionStore();
      render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => selectPeers(s).length}/>
        </ConnectionProvider>
      );

      expect(screen.getByTestId('value').textContent).toBe('0');

      act(() => {
        store.dispatch(peerConnected('p1'));
        store.dispatch(peerNamed('p1', 'Alice'));
      });

      expect(screen.getByTestId('value').textContent).toBe('1');
    });

    it('unsubscribes on unmount', () => {
      const store = createConnectionStore();
      const subscribeSpy = vi.spyOn(store, 'subscribe');

      const {unmount} = render(
        <ConnectionProvider store={store}>
          <TestComponent selector={s => selectFlow(s).phase}/>
        </ConnectionProvider>
      );

      unmount();

      expect(subscribeSpy).toHaveBeenCalled();
    });
  });

  describe('useConnectionStore', () => {
    it('exposes dispatch method', () => {
      const store = createConnectionStore();

      const Button = () => {
        const s = useConnectionStore();
        return <button onClick={() => s.dispatch(createOffer('pass'))}>go</button>;
      };

      render(
        <ConnectionProvider store={store}>
          <Button/>
        </ConnectionProvider>
      );

      screen.getByRole('button').click();

      expect(selectFlow(store.getState()).phase).toBe('creating');
    });
  });
});
