import type {Platform} from './platform'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'
const API_URL = 'https://api.github.com/repos/RyanDur/battleship/releases/latest'

const PLATFORM_EXTENSION: Partial<Record<Platform, string>> = {
  macos: '.dmg',
  windows: '.msi',
  linux: '.deb',
}

type Asset = {name: string; browser_download_url: string}
type FetchFn = typeof fetch

export const fetchDownloadUrl = (platform: Platform, fetchFn: FetchFn): Promise<string> => {
  const extension = PLATFORM_EXTENSION[platform]
  if (!extension) return Promise.resolve(RELEASES_PAGE)

  return fetchFn(API_URL)
    .then(response => {
      if (!response.ok) return RELEASES_PAGE
      return response.json().then((data: {assets: Asset[]}) => {
        const asset = data.assets.find(a => a.name.endsWith(extension))
        return asset?.browser_download_url ?? RELEASES_PAGE
      })
    })
    .catch(() => RELEASES_PAGE)
}
