export type SignalingMessage =
  | { type: 'OFFER'; sdp: string }
  | { type: 'ANSWER'; sdp: string }
  | { type: 'ICE_CANDIDATE'; candidate: string }
  | { type: 'ERROR'; message: string }
