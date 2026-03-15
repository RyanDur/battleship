export type PeerCommand =
  | { type: 'CREATE_OFFER' }
  | { type: 'ACCEPT_OFFER'; sdp: string }
  | { type: 'ACCEPT_ANSWER'; peerId: string; sdp: string }
  | { type: 'DISCONNECT'; peerId: string }

export type PeerEvent =
  | { type: 'OFFER_CREATED'; peerId: string; sdp: string }
  | { type: 'ANSWER_CREATED'; peerId: string; sdp: string }
  | { type: 'PEER_CONNECTED'; peerId: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'ERROR'; message: string }
