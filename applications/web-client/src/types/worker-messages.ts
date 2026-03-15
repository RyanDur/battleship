export type PeerCommand =
  | { type: 'CREATE_OFFER' }
  | { type: 'ACCEPT_OFFER'; sdp: string }
  | { type: 'ACCEPT_ANSWER'; sdp: string }

export type PeerEvent =
  | { type: 'OFFER_CREATED'; sdp: string }
  | { type: 'ANSWER_CREATED'; sdp: string }
  | { type: 'PEER_CONNECTED' }
  | { type: 'PEER_DISCONNECTED' }
  | { type: 'ERROR'; message: string }
