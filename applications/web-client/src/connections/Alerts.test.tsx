import {render, screen, act, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Alerts} from './Alerts';
import {ConnectionProvider} from './ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import {introductionReceived} from './connectionActions';
import {selectPendingIntroductions} from './connectionSelectors';

const makeStore = () => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store};
};

const setup = () => {
  const {store} = makeStore();
  render(
    <ConnectionProvider store={store}>
      <Alerts/>
    </ConnectionProvider>
  );
  return {store};
};

describe('Alerts', () => {
  it('shows a collapsible alerts section', () => {
    setup();

    expect(screen.getByRole('group', {name: /alerts/i})).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    setup();

    expect(screen.getByRole('group', {name: /alerts/i}).closest('details')).toHaveAttribute('open');
  });

  it('has an assertive live region for pending count', () => {
    setup();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('pending count is empty when there are no alerts', () => {
    setup();

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('shows pending count when introductions are waiting', async () => {
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('shows each pending introduction as an alert', async () => {
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    expect(screen.getByText(/alice wants to introduce you to carol/i)).toBeInTheDocument();
  });

  it('shows accept and decline buttons for each introduction', async () => {
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /decline/i})).toBeInTheDocument();
  });

  it('clicking accept removes the introduction', async () => {
    const user = userEvent.setup();
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    await user.click(screen.getByRole('button', {name: /accept/i}));

    expect(selectPendingIntroductions(store.getState())).toEqual([]);
  });

  it('clicking decline removes the introduction', async () => {
    const user = userEvent.setup();
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    await user.click(screen.getByRole('button', {name: /decline/i}));

    expect(selectPendingIntroductions(store.getState())).toEqual([]);
  });

  it('shows multiple introductions as separate alerts', async () => {
    const {store} = setup();

    await act(async () => {
      store.dispatch(introductionReceived('i1', 'Alice', 'Carol'));
      store.dispatch(introductionReceived('i2', 'Bob', 'Dave'));
    });

    expect(screen.getByText(/alice wants to introduce you to carol/i)).toBeInTheDocument();
    expect(screen.getByText(/bob wants to introduce you to dave/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('shows no list when there are no pending introductions', () => {
    setup();

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('each introduction is wrapped in an article', async () => {
    const {store} = setup();

    await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

    const list = within(screen.getByRole('list'));
    expect(list.getByRole('article')).toBeInTheDocument();
  });
});
