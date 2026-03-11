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

export const fetchDownloadUrl = (platform: Platform, apiUrl = API_URL): Promise<string> => {
  const extension = PLATFORM_EXTENSION[platform]
  if (!extension) return Promise.resolve(RELEASES_PAGE)

  return fetch(apiUrl)
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
