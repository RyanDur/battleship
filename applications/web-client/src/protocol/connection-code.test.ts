import { encodeConnectionCode, decodeConnectionCode } from './connection-code'

// Story #39: Secure, compact connection codes

const SAMPLE_SDP = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:abcd
a=ice-pwd:verylongpasswordthatispartoficecandidate
a=ice-options:trickle
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=max-message-size:262144
a=candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host
a=candidate:2 1 TCP 1518280447 192.168.1.1 9 typ host tcptype active
a=end-of-candidates`

describe('connection codes (Story #39)', () => {
  it('decodes what was encoded with the same passphrase', async () => {
    const passphrase = 'hello world'

    const code = await encodeConnectionCode(SAMPLE_SDP, passphrase)
    const result = await decodeConnectionCode(code, passphrase)

    expect(result.kind).toBe('success')
    expect(result.kind === 'success' && result.value).toBe(SAMPLE_SDP)
  })

  it('produces a code significantly shorter than the raw SDP', async () => {
    const code = await encodeConnectionCode(SAMPLE_SDP, 'passphrase')

    expect(code.length).toBeLessThan(SAMPLE_SDP.length)
  })

  it('fails with a clear error when the passphrase is wrong', async () => {
    const code = await encodeConnectionCode(SAMPLE_SDP, 'correct-passphrase')
    const result = await decodeConnectionCode(code, 'wrong-passphrase')

    expect(result.kind).toBe('failure')
  })
})
