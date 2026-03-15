export type PeerCommand =
  | { type: 'CREATE_OFFER' }
  | { type: 'ACCEPT_OFFER'; sdp: string }
  | { type: 'ACCEPT_ANSWER'; peerId: string; sdp: string }
  | { type: 'DISCONNECT'; peerId: string }
  | { type: 'GRANT_TRUST'; peerId: string }
  | { type: 'REVOKE_TRUST'; peerId: string }

export type PeerEvent =
  | { type: 'OFFER_CREATED'; peerId: string; sdp: string }
  | { type: 'ANSWER_CREATED'; peerId: string; sdp: string }
  | { type: 'PEER_CONNECTED'; peerId: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'PEER_TRUST_UPDATED'; peerId: string; trusts: boolean }
  | { type: 'ERROR'; message: string }
