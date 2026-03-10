import * as Decoder from 'schemawax'
import {maybe} from '../lib/maybe'
import type {Platform} from './platform'

export const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'
const API_URL = 'https://api.github.com/repos/RyanDur/battleship/releases/latest'

const PLATFORM_EXTENSION: Partial<Record<Platform, string>> = {
  macos: '.dmg',
  windows: '.msi',
  linux: '.deb',
}

const assetDecoder = Decoder.object({
  required: {
    name: Decoder.string,
    browser_download_url: Decoder.string,
  },
})

const releaseDecoder = Decoder.object({
  required: {assets: Decoder.array(assetDecoder)},
})

type Asset = Decoder.Output<typeof assetDecoder>
type FetchFn = typeof fetch

export const fetchDownloadUrl = (platform: Platform, fetchFn: FetchFn): Promise<string> => {
  const extension = PLATFORM_EXTENSION[platform]
  if (!extension) return Promise.resolve(RELEASES_PAGE)

  return fetchFn(API_URL)
    .then(response => {
      if (!response.ok) return RELEASES_PAGE
      return response.json().then(json => {
        const release = maybe(releaseDecoder.decode(json)).orNull()
        if (!release) return RELEASES_PAGE
        const asset = release.assets.find((a: Asset) => a.name.endsWith(extension))
        return asset?.browser_download_url ?? RELEASES_PAGE
      })
    })
    .catch(() => RELEASES_PAGE)
}
