export type WorkerCommand =
  | { type: 'CONNECT'; token: string; serviceUrl: string }
  | { type: 'DISCONNECT' }
  | { type: 'CREATE_OFFER' }
  | { type: 'ACCEPT_OFFER'; sdp: string }
  | { type: 'ACCEPT_ANSWER'; sdp: string }

export type WorkerEvent =
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED'; reason: string }
  | { type: 'OFFER_CREATED'; sdp: string }
  | { type: 'ANSWER_CREATED'; sdp: string }
  | { type: 'PEER_CONNECTED' }
  | { type: 'PEER_DISCONNECTED' }
  | { type: 'ERROR'; message: string }
