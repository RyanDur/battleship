import {render, screen, act, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DirectConnect} from './DirectConnect';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import {createOffer} from '../state/connectionActions';
import {selectFlow} from '../state/connectionSelectors';

const makeStore = () => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store};
};

const renderDirectConnect = (serviceOnline = true) => {
  const {store} = makeStore();
  render(
    <ConnectionProvider store={store}>
      <DirectConnect serviceOnline={serviceOnline}/>
    </ConnectionProvider>
  );
  return {store};
};

describe('DirectConnect', () => {
  it('shows Create and Join options when service is online', () => {
    renderDirectConnect(true);

    expect(screen.getByRole('button', {name: /create/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /join/i})).toBeInTheDocument();
  });

  it('hides connection UI when service is not online', () => {
    renderDirectConnect(false);

    expect(screen.queryByRole('button', {name: /create/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /join/i})).not.toBeInTheDocument();
  });

  it('clicking Create shows passphrase input', async () => {
    const user = userEvent.setup();
    renderDirectConnect();

    await user.click(screen.getByRole('button', {name: /create/i}));

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
  });

  it('submitting Create form transitions to offer-ready after SDP encodes', async () => {
    const user = userEvent.setup();
    const {store} = renderDirectConnect();

    await user.click(screen.getByRole('button', {name: /create/i}));
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret');
    await user.click(screen.getByRole('button', {name: /generate/i}));

    await waitFor(() => expect(selectFlow(store.getState()).phase).toBe('offer-ready'));
    expect(screen.getByText(/share this code/i)).toBeInTheDocument();
  });

  it('entering response code and accepting calls acceptAnswer', async () => {
    const user = userEvent.setup();
    const {store} = makeStore();
    render(
      <ConnectionProvider store={store}>
        <DirectConnect serviceOnline={true}/>
      </ConnectionProvider>
    );

    act(() => store.dispatch(createOffer('pass')));
    await waitFor(() => expect(screen.getByLabelText(/response code/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/response code/i), 'some-response-code');
    await user.click(screen.getByRole('button', {name: /accept/i}));

    expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
  });

  it('clicking Join shows passphrase and offer code inputs', async () => {
    const user = userEvent.setup();
    renderDirectConnect();

    await user.click(screen.getByRole('button', {name: /join/i}));

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/offer code/i)).toBeInTheDocument();
  });

  it('submitting Join form transitions to joining phase', async () => {
    const user = userEvent.setup();
    const {store} = renderDirectConnect();

    await user.click(screen.getByRole('button', {name: /join/i}));
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret');
    await user.type(screen.getByLabelText(/offer code/i), 'some-offer-code');
    await user.click(screen.getByRole('button', {name: /join/i}));

    await waitFor(() => expect(selectFlow(store.getState()).phase).toBe('joining'));
  });
});
