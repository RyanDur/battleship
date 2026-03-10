import {ServiceHealth} from './components/ServiceHealth'
import {checkHealth} from './protocol/health'

const EXPECTED_VERSION = '0.1.0'

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
