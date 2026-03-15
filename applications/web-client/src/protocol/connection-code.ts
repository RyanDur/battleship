import { success, failure, type Result } from '../lib/result'

export type CodecError = 'DECRYPT_FAILED'

const SALT_BYTES = 16
const IV_BYTES = 12
const PBKDF2_ITERATIONS = 100_000

const deriveKey = async (passphrase: string, salt: BufferSource): Promise<CryptoKey> => {
  const raw = new TextEncoder().encode(passphrase)
  const importedKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

const compress = async (data: string): Promise<ArrayBuffer> => {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(new TextEncoder().encode(data))
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out.buffer as ArrayBuffer
}

const decompress = async (data: BufferSource): Promise<string> => {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(data)
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return new TextDecoder().decode(out)
}

const toBase64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

const fromBase64url = (str: string): Uint8Array => {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

export const encodeConnectionCode = async (sdp: string, passphrase: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const compressed = await compress(sdp)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed)
  const out = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.byteLength)
  out.set(salt, 0)
  out.set(iv, SALT_BYTES)
  out.set(new Uint8Array(ciphertext), SALT_BYTES + IV_BYTES)
  return toBase64url(out)
}

export const decodeConnectionCode = async (code: string, passphrase: string): Promise<Result<string, CodecError>> => {
  try {
    const bytes = fromBase64url(code)
    const salt = bytes.slice(0, SALT_BYTES)
    const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
    const ciphertext = bytes.slice(SALT_BYTES + IV_BYTES)
    const key = await deriveKey(passphrase, salt)
    const compressed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    const sdp = await decompress(new Uint8Array(compressed))
    return success(sdp)
  } catch {
    return failure('DECRYPT_FAILED' as const)
  }
}
