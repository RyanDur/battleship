export const createOffer = (passphrase: string) => ({type: 'CREATE_OFFER' as const, passphrase});
export const offerSdpReady = (peerId: string, sdp: string) => ({type: 'OFFER_SDP_READY' as const, peerId, sdp});
export const offerEncoded = (peerId: string, code: string) => ({type: 'OFFER_ENCODED' as const, peerId, code});
export const joinOffer = (code: string, passphrase: string) => ({type: 'JOIN_OFFER' as const, code, passphrase});
export const answerSdpReady = (sdp: string) => ({type: 'ANSWER_SDP_READY' as const, sdp});
export const answerEncoded = (code: string) => ({type: 'ANSWER_ENCODED' as const, code});
export const decodeFailed = () => ({type: 'DECODE_FAILED' as const});
export const offerFailed = () => ({type: 'OFFER_FAILED' as const});
export const cancelOffer = () => ({type: 'CANCEL_OFFER' as const});

export const peerConnected = (peerId: string) => ({type: 'PEER_CONNECTED' as const, peerId});
export const peerDisconnected = (peerId: string) => ({type: 'PEER_DISCONNECTED' as const, peerId});

export const acceptOffer = (sdp: string) => ({type: 'ACCEPT_OFFER' as const, sdp});
export const acceptAnswer = (peerId: string, sdp: string) => ({type: 'ACCEPT_ANSWER' as const, peerId, sdp});
export const acceptAnswerCode = (responseCode: string) => ({type: 'ACCEPT_ANSWER_CODE' as const, responseCode});

export const serverOfferReceived = (signalingPeerId: string, name: string, sdp: string) => ({type: 'SERVER_OFFER_RECEIVED' as const, signalingPeerId, name, sdp});
export const serverAnswerReceived = (signalingPeerId: string, sdp: string) => ({type: 'SERVER_ANSWER_RECEIVED' as const, signalingPeerId, sdp});
export const relayOffer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_OFFER' as const, targetPeerId, sdp});
export const relayAnswer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ANSWER' as const, targetPeerId, sdp});
export const connectViaServer = (signalingPeerId: string, name: string) => ({type: 'CONNECT_VIA_SERVER' as const, signalingPeerId, name});
export const reconnectViaServer = (signalingPeerId: string, name: string) => ({type: 'RECONNECT_VIA_SERVER' as const, signalingPeerId, name});

export const startSignaling = () => ({type: 'START_SIGNALING' as const});
export const stopSignaling = () => ({type: 'STOP_SIGNALING' as const});

export const peerConnectionUnstable = (peerId: string) => ({type: 'PEER_CONNECTION_UNSTABLE' as const, peerId});
export const peerConnectionRestored = (peerId: string) => ({type: 'PEER_CONNECTION_RESTORED' as const, peerId});

export const relayIceRestart = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ICE_RESTART' as const, targetPeerId, sdp});
export const relayIceRestartAnswer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ICE_RESTART_ANSWER' as const, targetPeerId, sdp});
export const iceRestartReceived = (signalingPeerId: string, sdp: string) => ({type: 'ICE_RESTART_RECEIVED' as const, signalingPeerId, sdp});
export const iceRestartAnswerReceived = (signalingPeerId: string, sdp: string) => ({type: 'ICE_RESTART_ANSWER_RECEIVED' as const, signalingPeerId, sdp});
export const iceRestartAttempted = (peerId: string) => ({type: 'ICE_RESTART_ATTEMPTED' as const, peerId});

export const signalingPeerRegistered = (localPeerId: string, signalingPeerId: string, isOfferer: boolean) => ({type: 'SIGNALING_PEER_REGISTERED' as const, localPeerId, signalingPeerId, isOfferer});
export const introChannelRegistered = (introId: string, relayPeerId: string) => ({type: 'INTRO_CHANNEL_REGISTERED' as const, introId, relayPeerId});
export const introConnectionRegistered = (introId: string, newPeerId: string) => ({type: 'INTRO_CONNECTION_REGISTERED' as const, introId, newPeerId});
export const introConnectionCleared = (introId: string) => ({type: 'INTRO_CONNECTION_CLEARED' as const, introId});
