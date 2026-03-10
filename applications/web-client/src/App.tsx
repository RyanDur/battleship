import {ServiceHealth} from './components/ServiceHealth'
import {checkHealth} from './protocol/health'

const EXPECTED_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

function App() {
  return (
    <main>
      <h1>Battleship</h1>
      <ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>
      <a href="https://github.com/RyanDur/battleship/releases/latest">Download</a>
    </main>
  )
}

export default App
