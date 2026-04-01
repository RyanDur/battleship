import type {TransportState} from './transport';

export const selectFlow = (state: TransportState) => state.flow;
export const selectIsCreatingOffer = (state: TransportState) =>
  state.flow.phase === 'creating' || state.flow.phase === 'encoding-offer';

export const selectHandlerState = (state: TransportState) => state.handlerState;
export const selectOffererPeerIds = (state: TransportState) => state.handlerState.offererPeerIds;
export const selectPeerToSignaling = (state: TransportState) => state.handlerState.peerToSignaling;
export const selectSignalingToPeer = (state: TransportState) => state.handlerState.signalingToPeer;
export const selectIceRestartAttempts = (state: TransportState) => state.handlerState.iceRestartAttempts;
export const selectIntroChannels = (state: TransportState) => state.handlerState.introChannels;
export const selectIntroConnections = (state: TransportState) => state.handlerState.introConnections;
export const selectPeerConnectionHealth = (state: TransportState) => state.peerConnectionHealth;
