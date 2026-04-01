import {render, screen, act} from '@testing-library/react';
import {StoreProvider} from './StoreProvider';
import {useSelector, useDispatch} from './useStore';
import {createAppStore} from './store';
import type {CombinedState} from './store';
import {createOffer} from '../transport/transportActions';
import {peerConnected, peerNamed} from './connectionActions';
import {selectFlow} from '../transport/transportSelectors';
import {selectPeers} from './connectionSelectors';

const TestComponent = ({selector}: {selector: (s: CombinedState) => unknown}) => {
  const value = useSelector(selector);
  return <div data-testid="value">{JSON.stringify(value)}</div>;
};

describe('StoreContext', () => {
  describe('useSelector', () => {
    it('returns initial selected state', () => {
      const store = createAppStore();
      render(
        <StoreProvider store={store}>
          <TestComponent selector={s => selectFlow(s).phase}/>
        </StoreProvider>
      );

      expect(screen.getByTestId('value').textContent).toBe('"idle"');
    });

    it('updates when store changes', async () => {
      const store = createAppStore();
      render(
        <StoreProvider store={store}>
          <TestComponent selector={s => selectPeers(s).length}/>
        </StoreProvider>
      );

      expect(screen.getByTestId('value').textContent).toBe('0');

      act(() => {
        store.dispatch(peerConnected('p1'));
        store.dispatch(peerNamed('p1', 'Alice'));
      });

      expect(screen.getByTestId('value').textContent).toBe('1');
    });

    it('unsubscribes on unmount', () => {
      const store = createAppStore();
      const subscribeSpy = vi.spyOn(store, 'subscribe');

      const {unmount} = render(
        <StoreProvider store={store}>
          <TestComponent selector={s => selectFlow(s).phase}/>
        </StoreProvider>
      );

      unmount();

      expect(subscribeSpy).toHaveBeenCalled();
    });
  });

  describe('useDispatch', () => {
    it('exposes dispatch method', () => {
      const store = createAppStore();

      const Button = () => {
        const dispatch = useDispatch();
        return <button onClick={() => dispatch(createOffer('pass'))}>go</button>;
      };

      render(
        <StoreProvider store={store}>
          <Button/>
        </StoreProvider>
      );

      screen.getByRole('button').click();

      expect(selectFlow(store.getState()).phase).toBe('creating');
    });
  });
});
