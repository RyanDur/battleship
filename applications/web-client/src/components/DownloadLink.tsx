import {useEffect, useState} from 'react'
import type {Platform} from '../protocol/platform'

const RELEASES_PAGE = 'https://github.com/RyanDur/battleship/releases/latest'

const PLATFORM_LABEL: Record<Platform, string> = {
  macos: 'Download for macOS',
  windows: 'Download for Windows',
  linux: 'Download for Linux',
  unknown: 'Download',
}

interface DownloadLinkProps {
  platform: Platform
  fetchDownloadUrl: (platform: Platform) => Promise<string>
}

export function DownloadLink({platform, fetchDownloadUrl}: DownloadLinkProps) {
  const [href, setHref] = useState(RELEASES_PAGE)

  useEffect(() => {
    fetchDownloadUrl(platform)
      .then(setHref)
      .catch(() => setHref(RELEASES_PAGE))
  }, [platform, fetchDownloadUrl])

  return <a href={href}>{PLATFORM_LABEL[platform]}</a>
}
