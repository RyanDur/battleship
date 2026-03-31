import { encodeConnectionCode, decodeConnectionCode } from '../transport/connectionCode';

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
a=end-of-candidates`;

describe('connection codes (Story #39)', () => {
  it('decodes what was encoded with the same passphrase', async () => {
    const passphrase = 'hello world';

    const encoded = await encodeConnectionCode(SAMPLE_SDP, passphrase).value;
    expect(encoded.kind).toBe('success');
    if (encoded.kind !== 'success') return;

    const decoded = await decodeConnectionCode(encoded.value, passphrase).value;
    expect(decoded.kind).toBe('success');
    expect(decoded.kind === 'success' && decoded.value).toBe(SAMPLE_SDP);
  });

  it('produces a code significantly shorter than the raw SDP', async () => {
    const result = await encodeConnectionCode(SAMPLE_SDP, 'passphrase').value;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(result.value.length).toBeLessThan(SAMPLE_SDP.length);
  });

  it('fails with a clear error when the passphrase is wrong', async () => {
    const encoded = await encodeConnectionCode(SAMPLE_SDP, 'correct-passphrase').value;
    if (encoded.kind !== 'success') return;

    const result = await decodeConnectionCode(encoded.value, 'wrong-passphrase').value;
    expect(result.kind).toBe('failure');
  });
});
