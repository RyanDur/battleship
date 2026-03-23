export type PeerCommand =
  | { type: 'CREATE_OFFER' }
  | { type: 'SEND_MESSAGE'; peerId: string; text: string }
  | { type: 'ACCEPT_OFFER'; sdp: string }
  | { type: 'ACCEPT_ANSWER'; peerId: string; sdp: string }
  | { type: 'DISCONNECT'; peerId: string }
  | { type: 'GRANT_TRUST'; peerId: string }
  | { type: 'REVOKE_TRUST'; peerId: string }
  | { type: 'INTRODUCE_PEERS'; peerId1: string; peerId2: string }
  | { type: 'ACCEPT_INTRODUCTION'; introId: string; relayPeerId?: string }
  | { type: 'DECLINE_INTRODUCTION'; introId: string; relayPeerId?: string }
  | { type: 'CONNECT_VIA_SERVER'; signalingPeerId: string; name: string }
  | { type: 'SERVER_OFFER_RECEIVED'; signalingPeerId: string; name: string; sdp: string }
  | { type: 'SERVER_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string }
  | { type: 'ICE_RESTART_RECEIVED'; signalingPeerId: string; sdp: string }
  | { type: 'ICE_RESTART_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string }
  | { type: 'SEND_TO_PEER'; peerId: string; message: Record<string, unknown> }
  | { type: 'START_COIN_FLIP'; peerId: string }

export type PeerEvent =
  | { type: 'OFFER_CREATED'; peerId: string; sdp: string }
  | { type: 'ANSWER_CREATED'; peerId: string; sdp: string }
  | { type: 'PEER_CONNECTED'; peerId: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'PEER_TRUST_UPDATED'; peerId: string; trusts: boolean }
  | { type: 'INTRODUCTION_RECEIVED'; introId: string; from: string; peer: string }
  | { type: 'INTRODUCTION_DECLINED'; introId: string }
  | { type: 'INTRODUCTION_EXPIRED'; introId: string }
  | { type: 'ERROR'; message: string }
  | { type: 'SERVER_OFFER_CREATED'; signalingPeerId: string; localPeerId: string; sdp: string }
  | { type: 'SERVER_ANSWER_CREATED'; signalingPeerId: string; sdp: string }
  | { type: 'PEER_CONNECTION_UNSTABLE'; peerId: string }
  | { type: 'PEER_CONNECTION_RESTORED'; peerId: string }
  | { type: 'ICE_RESTART_OFFER_CREATED'; signalingPeerId: string; sdp: string }
  | { type: 'ICE_RESTART_ANSWER_CREATED'; signalingPeerId: string; sdp: string }
  | { type: 'MESSAGE_RECEIVED'; peerId: string; text: string }
