export type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

export const detectPlatform = (userAgent: string): Platform => {
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'macos'
  if (/Win/i.test(userAgent)) return 'windows'
  if (/Linux/i.test(userAgent)) return 'linux'
  return 'unknown'
}
