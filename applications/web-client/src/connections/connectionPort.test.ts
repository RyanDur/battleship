import {createConnectionPort} from '../transport/connectionPort';
import type {ConnectionEvent} from '../transport/connectionPort';

describe('connectionPort', () => {
  const makeDeps = () => ({
    sendToPeer: vi.fn(),
    sendToServer: vi.fn(),
  });

  it('sendToPeer delegates to deps', () => {
    const deps = makeDeps();
    const {port} = createConnectionPort(deps);
    port.sendToPeer('p1', {type: 'FIRE', row: 1, col: 2});
    expect(deps.sendToPeer).toHaveBeenCalledWith('p1', {type: 'FIRE', row: 1, col: 2});
  });

  it('sendToServer delegates to deps', () => {
    const deps = makeDeps();
    const {port} = createConnectionPort(deps);
    port.sendToServer({type: 'LOAD_BOARD'});
    expect(deps.sendToServer).toHaveBeenCalledWith({type: 'LOAD_BOARD'});
  });

  it('subscribe receives emitted events', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const received: ConnectionEvent[] = [];
    port.subscribe(event => received.push(event));
    emit({type: 'PEER_CONNECTED', peerId: 'p1', isOfferer: true});
    expect(received).toEqual([{type: 'PEER_CONNECTED', peerId: 'p1', isOfferer: true}]);
  });

  it('unsubscribe stops delivery', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const received: ConnectionEvent[] = [];
    const unsub = port.subscribe(event => received.push(event));
    unsub();
    emit({type: 'PEER_DISCONNECTED', peerId: 'p1'});
    expect(received).toEqual([]);
  });

  it('multiple subscribers each receive events', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const a: ConnectionEvent[] = [];
    const b: ConnectionEvent[] = [];
    port.subscribe(e => a.push(e));
    port.subscribe(e => b.push(e));
    emit({type: 'PEER_MESSAGE', peerId: 'p1', data: {type: 'CHAT'}});
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
