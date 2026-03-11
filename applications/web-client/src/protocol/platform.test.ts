import {detectPlatform} from './platform'

describe('detectPlatform', () => {
  it('detects macOS', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectPlatform(userAgent)).toBe('macos')
  })

  it('detects Windows', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectPlatform(userAgent)).toBe('windows')
  })

  it('detects Linux', () => {
    const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(detectPlatform(userAgent)).toBe('linux')
  })

  it('returns unknown for empty userAgent', () => {
    expect(detectPlatform('')).toBe('unknown')
  })
})
