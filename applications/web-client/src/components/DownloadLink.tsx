import {useEffect, useState} from 'react'
import {RELEASES_PAGE} from '../protocol/download'
import type {Platform} from '../protocol/platform'

type Action = 'download' | 'upgrade' | 'none'

const LABEL: Record<Action, Record<Platform, string>> = {
  download: {
    macos: 'Download for macOS',
    windows: 'Download for Windows',
    linux: 'Download for Linux',
    unknown: 'Download',
  },
  upgrade: {
    macos: 'Upgrade for macOS',
    windows: 'Upgrade for Windows',
    linux: 'Upgrade for Linux',
    unknown: 'Upgrade',
  },
  none: {macos: '', windows: '', linux: '', unknown: ''},
}

interface DownloadLinkProps {
  platform: Platform
  action: Action
  fetchDownloadUrl: (platform: Platform) => Promise<string>
}

export function DownloadLink({platform, action, fetchDownloadUrl}: DownloadLinkProps) {
  const [href, setHref] = useState(RELEASES_PAGE)

  useEffect(() => {
    fetchDownloadUrl(platform)
      .then(setHref)
      .catch(() => setHref(RELEASES_PAGE))
  }, [platform, fetchDownloadUrl])

  if (action === 'none') return null

  return (
    <>
      <a href={href}>{LABEL[action][platform]}</a>
      {platform === 'macos' && (
        <p>macOS will block the app on first launch. Go to System Settings → Privacy & Security and click Open Anyway.</p>
      )}
    </>
  )
}
