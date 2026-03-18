import type {OnlinePeer, PreviousPeer} from './connections';

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
export const peerNamed = (peerId: string, name: string) => ({type: 'PEER_NAMED' as const, peerId, name});
export const grantTrust = (peerId: string) => ({type: 'GRANT_TRUST' as const, peerId});
export const revokeTrust = (peerId: string) => ({type: 'REVOKE_TRUST' as const, peerId});
export const peerTrustUpdated = (peerId: string, trusts: boolean) => ({type: 'PEER_TRUST_UPDATED' as const, peerId, trusts});
export const disconnect = (peerId: string) => ({type: 'DISCONNECT' as const, peerId});
export const forgetPeer = (peerId: string) => ({type: 'FORGET_PEER' as const, peerId});

export const introductionReceived = (introId: string, from: string, peer: string) => ({type: 'INTRODUCTION_RECEIVED' as const, introId, from, peer});
export const introductionResolved = (introId: string) => ({type: 'INTRODUCTION_RESOLVED' as const, introId});
export const acceptIntroduction = (introId: string) => ({type: 'ACCEPT_INTRODUCTION' as const, introId});
export const declineIntroduction = (introId: string) => ({type: 'DECLINE_INTRODUCTION' as const, introId});
export const introducePeers = (peerId1: string, peerId2: string) => ({type: 'INTRODUCE_PEERS' as const, peerId1, peerId2});

export const onlinePeersUpdated = (peers: OnlinePeer[]) => ({type: 'ONLINE_PEERS_UPDATED' as const, peers});
export const onlinePeerJoined = (peerId: string, name: string) => ({type: 'ONLINE_PEER_JOINED' as const, peerId, name});
export const onlinePeerLeft = (peerId: string) => ({type: 'ONLINE_PEER_LEFT' as const, peerId});

export const previousPeersReceived = (peers: PreviousPeer[]) => ({type: 'PREVIOUS_PEERS_RECEIVED' as const, peers});
export const previousPeerConnected = (signalingPeerId: string) => ({type: 'PREVIOUS_PEER_CONNECTED' as const, signalingPeerId});

export const serverOfferReceived = (signalingPeerId: string, name: string, sdp: string) => ({type: 'SERVER_OFFER_RECEIVED' as const, signalingPeerId, name, sdp});
export const serverAnswerReceived = (signalingPeerId: string, sdp: string) => ({type: 'SERVER_ANSWER_RECEIVED' as const, signalingPeerId, sdp});
export const relayOffer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_OFFER' as const, targetPeerId, sdp});
export const relayAnswer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ANSWER' as const, targetPeerId, sdp});
export const acceptOffer = (sdp: string) => ({type: 'ACCEPT_OFFER' as const, sdp});
export const acceptAnswer = (peerId: string, sdp: string) => ({type: 'ACCEPT_ANSWER' as const, peerId, sdp});
export const acceptAnswerCode = (responseCode: string) => ({type: 'ACCEPT_ANSWER_CODE' as const, responseCode});
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

export const emailSharedReceived = (fromPeerId: string, email: string) => ({type: 'EMAIL_SHARED_RECEIVED' as const, fromPeerId, email});
export const emailRevokedReceived = (fromPeerId: string) => ({type: 'EMAIL_REVOKED_RECEIVED' as const, fromPeerId});
export const shareEmail = (targetPeerId: string) => ({type: 'SHARE_EMAIL' as const, targetPeerId});
export const stopSharingEmail = (targetPeerId: string) => ({type: 'STOP_SHARING_EMAIL' as const, targetPeerId});
export const updateEmail = (email: string) => ({type: 'UPDATE_EMAIL' as const, email});
export const savePeerEmail = (peerId: string, email: string) => ({type: 'SAVE_PEER_EMAIL' as const, peerId, email});
