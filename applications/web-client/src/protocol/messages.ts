import * as Decoder from 'schemawax'

const offer = Decoder.object({
  required: { type: Decoder.literal('OFFER'), sdp: Decoder.string },
})

const answer = Decoder.object({
  required: { type: Decoder.literal('ANSWER'), sdp: Decoder.string },
})

const iceCandidate = Decoder.object({
  required: { type: Decoder.literal('ICE_CANDIDATE'), candidate: Decoder.string },
})

const error = Decoder.object({
  required: { type: Decoder.literal('ERROR'), message: Decoder.string },
})

export const signalingMessage = Decoder.oneOf(offer, answer, iceCandidate, error)

export type SignalingMessage = Decoder.Output<typeof signalingMessage>
