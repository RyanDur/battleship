import {asyncSuccess, asyncFailure, type AsyncResult} from '../lib/asyncResult';
import type {Platform} from './platform';

export const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest';

const REPO_URL = 'https://github.com/RyanDur/battleship';

const coerceVersion = (version: string): string => {
  const parts = version.split('.');
  const major = Math.max(1, Number(parts[0] ?? 0));
  return [major, ...parts.slice(1)].join('.');
};

const PLATFORM_ASSET: Partial<Record<Platform, (version: string) => string>> = {
  macos: (v) => `Battleship-${v}.dmg`,
  windows: (v) => `Battleship-${v}.msi`,
  linux: (v) => `battleship_${v}_amd64.deb`,
};

export const downloadUrl = (platform: Platform, version: string): AsyncResult<string, Error> => {
  const assetName = PLATFORM_ASSET[platform];
  if (!assetName) return asyncFailure(new Error(`No installer available for platform: ${platform}`));
  const coerced = coerceVersion(version);
  return asyncSuccess(`${REPO_URL}/releases/download/v${version}/${assetName(coerced)}`);
};
