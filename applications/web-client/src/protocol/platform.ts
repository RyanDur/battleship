export type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

export const detectPlatform = (userAgent: string): Platform => {
  if (/Android/i.test(userAgent)) return 'unknown'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'unknown'
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'macos'
  if (/Win/i.test(userAgent)) return 'windows'
  if (/Linux/i.test(userAgent)) return 'linux'
  return 'unknown'
}
