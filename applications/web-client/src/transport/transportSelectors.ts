import type {TransportState} from './transport';

type WithTransport = {transport: TransportState}

export const selectFlow = (state: WithTransport) => state.transport.flow;
export const selectIsCreatingOffer = (state: WithTransport) =>
  state.transport.flow.phase === 'creating' || state.transport.flow.phase === 'encoding-offer';

export const selectHandlerState = (state: WithTransport) => state.transport.handlerState;
export const selectOffererPeerIds = (state: WithTransport) => state.transport.handlerState.offererPeerIds;
export const selectPeerToSignaling = (state: WithTransport) => state.transport.handlerState.peerToSignaling;
export const selectSignalingToPeer = (state: WithTransport) => state.transport.handlerState.signalingToPeer;
export const selectIceRestartAttempts = (state: WithTransport) => state.transport.handlerState.iceRestartAttempts;
export const selectIntroChannels = (state: WithTransport) => state.transport.handlerState.introChannels;
export const selectIntroConnections = (state: WithTransport) => state.transport.handlerState.introConnections;
export const selectPeerConnectionHealth = (state: WithTransport) => state.transport.peerConnectionHealth;
