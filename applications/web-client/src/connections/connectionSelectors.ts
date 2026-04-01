import type {ConnectionsState} from './connections';

export const selectPeers = (state: ConnectionsState) => state.peers;
export const selectPendingIntroductions = (state: ConnectionsState) => state.pendingIntroductions;
export const selectOnlinePeers = (state: ConnectionsState) => state.onlinePeers;
export const selectPreviousPeers = (state: ConnectionsState) => state.previousPeers;
export const selectMessages = (state: ConnectionsState) => state.messages;
