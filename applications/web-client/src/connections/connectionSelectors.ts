import type {ConnectionsState} from './connections';

type WithConnections = {connections: ConnectionsState}

export const selectPeers = (state: WithConnections) => state.connections.peers;
export const selectPendingIntroductions = (state: WithConnections) => state.connections.pendingIntroductions;
export const selectOnlinePeers = (state: WithConnections) => state.connections.onlinePeers;
export const selectPreviousPeers = (state: WithConnections) => state.connections.previousPeers;
export const selectMessages = (state: WithConnections) => state.connections.messages;
