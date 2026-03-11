import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {fetchDownloadUrl} from './protocol/download'
import {startHeartbeat} from './protocol/heartbeat'
import {detectPlatform} from './protocol/platform'

const EXPECTED_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'
const SERVICE_URL = import.meta.env.VITE_SERVICE_URL ?? 'http://localhost:8080'
const WS_HEALTH_URL = SERVICE_URL.replace(/^http/, 'ws') + '/ws/health'

const platform = detectPlatform(navigator.userAgent)
const downloadUrl = (p: Parameters<typeof fetchDownloadUrl>[0]) => fetchDownloadUrl(p, fetch)

const connectHeartbeat: Parameters<typeof ServiceHealth>[0]['connectHeartbeat'] = (onStateChange) =>
  startHeartbeat(
    {createWebSocket: (url) => new WebSocket(url), url: WS_HEALTH_URL, expectedVersion: EXPECTED_VERSION},
    onStateChange
  )

function App() {
  return (
    <main>
      <h1>Battleship</h1>
      <ServiceHealth connectHeartbeat={connectHeartbeat}/>
      <DownloadLink platform={platform} fetchDownloadUrl={downloadUrl}/>
    </main>
  )
}

export default App
