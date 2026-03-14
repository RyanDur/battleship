import * as Decoder from 'schemawax'
import {maybe} from '../lib/maybe'
import {asyncResult, asyncSuccess, asyncFailure, type AsyncResult} from '../lib/asyncResult'
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

const findAssetUrl = (json: unknown, extension: string): AsyncResult<string, null> => {
  const url = maybe(releaseDecoder.decode(json))
    .mBind(release => maybe(release.assets.find((asset: Asset) => asset.name.endsWith(extension))))
    .map(asset => asset.browser_download_url)
    .orNull()
  return url ? asyncSuccess(url) : asyncFailure(null)
}

export const fetchDownloadUrl = (platform: Platform, apiUrl = API_URL): Promise<string> => {
  const extension = PLATFORM_EXTENSION[platform]
  if (!extension) return Promise.resolve(RELEASES_PAGE)

  return asyncResult<Response, null>(fetch(apiUrl))
    .andThen(response => response.ok
      ? asyncResult<unknown, null>(response.json())
      : asyncFailure(null))
    .andThen(json => findAssetUrl(json, extension))
    .mapEither(url => url, () => RELEASES_PAGE)
}
