import { asyncResult, asyncSuccess, asyncFailure, type AsyncResult } from '../lib/asyncResult';

export type CodecError = 'DECRYPT_FAILED'

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 100_000;

const toBase64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const fromBase64url = (str: string): Uint8Array => {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

const deriveKey = (passphrase: string, salt: BufferSource): AsyncResult<CryptoKey, Error> =>
  asyncResult<CryptoKey, Error>(
    crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  ).andThen(importedKey =>
    asyncResult(crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      importedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    ))
  );

const readChunks = (reader: ReadableStreamDefaultReader<Uint8Array>, chunks: Uint8Array[] = []): AsyncResult<Uint8Array[], Error> =>
  asyncResult<ReadableStreamReadResult<Uint8Array>, Error>(reader.read())
    .andThen(({done, value}) => {
      if (done) return asyncSuccess<Uint8Array[], Error>(chunks);
      chunks.push(value);
      return readChunks(reader, chunks);
    });

const assemble = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
};

const compress = (data: string): AsyncResult<ArrayBuffer, Error> => {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  return asyncResult<void, Error>(writer.write(new TextEncoder().encode(data)))
    .andThen(() => asyncResult<void, Error>(writer.close()))
    .andThen(() => readChunks(stream.readable.getReader()))
    .map(chunks => assemble(chunks).buffer as ArrayBuffer);
};

const decompress = (data: BufferSource): AsyncResult<string, Error> => {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  return asyncResult<void, Error>(writer.write(data))
    .andThen(() => asyncResult<void, Error>(writer.close()))
    .andThen(() => readChunks(stream.readable.getReader()))
    .map(chunks => new TextDecoder().decode(assemble(chunks)));
};

export const encodeConnectionCode = (sdp: string, passphrase: string): AsyncResult<string, Error> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  return deriveKey(passphrase, salt)
    .andThen(key =>
      compress(sdp).andThen(compressed =>
        asyncResult(crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
      )
    )
    .map(ciphertext => {
      const out = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.byteLength);
      out.set(salt, 0);
      out.set(iv, SALT_BYTES);
      out.set(new Uint8Array(ciphertext), SALT_BYTES + IV_BYTES);
      return toBase64url(out);
    });
};

export const decodeConnectionCode = (code: string, passphrase: string): AsyncResult<string, CodecError> => {
  try {
    const bytes = fromBase64url(code);
    const salt = bytes.slice(0, SALT_BYTES);
    const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ciphertext = bytes.slice(SALT_BYTES + IV_BYTES);
    return deriveKey(passphrase, salt)
      .andThen(key => asyncResult(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)))
      .andThen(compressed => decompress(new Uint8Array(compressed)))
      .or(() => asyncFailure('DECRYPT_FAILED' as CodecError));
  } catch {
    return asyncFailure('DECRYPT_FAILED');
  }
};
