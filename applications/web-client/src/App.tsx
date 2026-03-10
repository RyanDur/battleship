import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {fetchDownloadUrl} from './protocol/download'
import {checkHealth} from './protocol/health'
import {detectPlatform} from './protocol/platform'

const EXPECTED_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'
const platform = detectPlatform(navigator.userAgent)
const downloadUrl = (p: Parameters<typeof fetchDownloadUrl>[0]) => fetchDownloadUrl(p, fetch)

function App() {
  return (
    <main>
      <h1>Battleship</h1>
      <ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>
      <DownloadLink platform={platform} fetchDownloadUrl={downloadUrl}/>
    </main>
  )
}

export default App
