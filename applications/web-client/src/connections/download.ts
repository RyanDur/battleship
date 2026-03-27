import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {asyncResult, asyncTryCatch, asyncSuccess, asyncFailure, type AsyncResult} from '../lib/asyncResult';
import type {Platform} from './platform';
import {HttpError} from './http';

export const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest';

const API_URL = 'https://api.github.com/repos/RyanDur/battleship/releases/latest';

const PLATFORM_EXTENSION: Partial<Record<Platform, string>> = {
  macos: '.dmg',
  windows: '.msi',
  linux: '.deb',
};

const assetDecoder = Decoder.object({
  required: {
    name: Decoder.string,
    browser_download_url: Decoder.string,
  },
});

const releaseDecoder = Decoder.object({
  required: {assets: Decoder.array(assetDecoder)},
});

type Asset = Decoder.Output<typeof assetDecoder>

const findAssetUrl = (json: unknown, extension: string): AsyncResult<string, Error> => {
  const url = maybe(releaseDecoder.decode(json))
    .mBind(release => maybe(release.assets.find((asset: Asset) => asset.name.endsWith(extension))))
    .map(asset => asset.browser_download_url)
    .orNull();
  return url ? asyncSuccess(url) : asyncFailure(new Error(`No ${extension} asset found in release`));
};

export const fetchDownloadUrl = (platform: Platform, apiUrl = API_URL): AsyncResult<string, Error> => {
  const extension = PLATFORM_EXTENSION[platform];
  if (!extension) return asyncFailure(new Error(`No installer available for platform: ${platform}`));

  return asyncResult<Response, Error>(fetch(apiUrl))
    .andThen(response => response.ok
      ? asyncTryCatch(() => response.json())
      : asyncFailure(new HttpError(response.status)))
    .andThen(json => findAssetUrl(json, extension));
};
