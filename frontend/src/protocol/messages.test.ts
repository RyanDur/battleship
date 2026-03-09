import { describe, it, expect } from 'vitest'
import { signalingMessage, type SignalingMessage } from './messages'

// Story: Runtime-safe decoding of signaling messages at the WebSocket boundary
// The WebSocket receives raw JSON from the peer relay. These messages are untrusted
// and must be decoded with schemawax before use.

describe('SignalingMessage decoder', () => {
  it('decodes an OFFER message', () => {
    const raw = JSON.parse('{"type":"OFFER","sdp":"v=0\\r\\no=- 123 ..."}')

    const result = signalingMessage.decode(raw)

    expect(result).toEqual({ type: 'OFFER', sdp: 'v=0\r\no=- 123 ...' })
  })

  it('decodes an ANSWER message', () => {
    const raw = JSON.parse('{"type":"ANSWER","sdp":"v=0\\r\\no=- 456 ..."}')

    const result = signalingMessage.decode(raw)

    expect(result).toEqual({ type: 'ANSWER', sdp: 'v=0\r\no=- 456 ...' })
  })

  it('decodes an ICE_CANDIDATE message', () => {
    const raw = JSON.parse('{"type":"ICE_CANDIDATE","candidate":"candidate:1 1 UDP ..."}')

    const result = signalingMessage.decode(raw)

    expect(result).toEqual({ type: 'ICE_CANDIDATE', candidate: 'candidate:1 1 UDP ...' })
  })

  it('decodes an ERROR message', () => {
    const raw = JSON.parse('{"type":"ERROR","message":"something went wrong"}')

    const result = signalingMessage.decode(raw)

    expect(result).toEqual({ type: 'ERROR', message: 'something went wrong' })
  })

  it('returns null for unknown message types', () => {
    const raw = JSON.parse('{"type":"UNKNOWN","data":"foo"}')

    const result = signalingMessage.decode(raw)

    expect(result).toBeNull()
  })

  it('returns null for malformed messages', () => {
    expect(signalingMessage.decode(null)).toBeNull()
    expect(signalingMessage.decode(undefined)).toBeNull()
    expect(signalingMessage.decode('not an object')).toBeNull()
    expect(signalingMessage.decode(42)).toBeNull()
    expect(signalingMessage.decode({})).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    expect(signalingMessage.decode({ type: 'OFFER' })).toBeNull()
    expect(signalingMessage.decode({ type: 'ANSWER' })).toBeNull()
    expect(signalingMessage.decode({ type: 'ICE_CANDIDATE' })).toBeNull()
    expect(signalingMessage.decode({ type: 'ERROR' })).toBeNull()
  })

  it('returns null when fields have wrong types', () => {
    expect(signalingMessage.decode({ type: 'OFFER', sdp: 123 })).toBeNull()
    expect(signalingMessage.decode({ type: 'ERROR', message: true })).toBeNull()
  })

  it('derives the SignalingMessage type from the decoder', () => {
    // This is a compile-time check — if the type derivation breaks,
    // TypeScript will fail to compile this assignment.
    const offer: SignalingMessage = { type: 'OFFER' as const, sdp: 'test' }
    const answer: SignalingMessage = { type: 'ANSWER' as const, sdp: 'test' }
    const ice: SignalingMessage = { type: 'ICE_CANDIDATE' as const, candidate: 'test' }
    const error: SignalingMessage = { type: 'ERROR' as const, message: 'test' }

    expect(offer.type).toBe('OFFER')
    expect(answer.type).toBe('ANSWER')
    expect(ice.type).toBe('ICE_CANDIDATE')
    expect(error.type).toBe('ERROR')
  })
})
