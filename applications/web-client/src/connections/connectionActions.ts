import type {OnlinePeer, PreviousPeer} from './connections';

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

export const emailSharedReceived = (fromPeerId: string, email: string) => ({type: 'EMAIL_SHARED_RECEIVED' as const, fromPeerId, email});
export const emailRevokedReceived = (fromPeerId: string) => ({type: 'EMAIL_REVOKED_RECEIVED' as const, fromPeerId});
export const shareEmail = (targetPeerId: string) => ({type: 'SHARE_EMAIL' as const, targetPeerId});
export const stopSharingEmail = (targetPeerId: string) => ({type: 'STOP_SHARING_EMAIL' as const, targetPeerId});
export const updateEmail = (email: string) => ({type: 'UPDATE_EMAIL' as const, email});
export const savePeerEmail = (peerId: string, email: string) => ({type: 'SAVE_PEER_EMAIL' as const, peerId, email});

export const messageReceived = (peerId: string, text: string) => ({type: 'MESSAGE_RECEIVED' as const, peerId, text});
export const sendMessage = (peerId: string, text: string) => ({type: 'SEND_MESSAGE' as const, peerId, text});

export const sendToPeer = (peerId: string, message: Record<string, unknown>) => ({type: 'SEND_TO_PEER' as const, peerId, message});
