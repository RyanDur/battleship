import {useState} from 'react'
import {useConnectionState, useConnectionStore} from '../state/useConnection'
import type {ConnectionFlow} from '../state/connections'

type FlowPhase =
  | {phase: 'idle'}
  | {phase: 'creating'}
  | {phase: 'offer-ready'; code: string}
  | {phase: 'joining'}
  | {phase: 'answer-ready'; code: string}

const toFlowPhase = (flow: ConnectionFlow): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code}
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code}
  if (flow.phase === 'encoding-offer') return {phase: 'creating'}
  if (flow.phase === 'encoding-answer') return {phase: 'joining'}
  return {phase: flow.phase}
}

type Props = {
  serviceOnline: boolean
}

export const Connections = ({serviceOnline}: Props) => {
  const store = useConnectionStore()
  const flow = toFlowPhase(useConnectionState(s => s.flow))
  const peers = useConnectionState(s => s.peers)

  const [formMode, setFormMode] = useState<'none' | 'create' | 'join'>('none')
  const [passphrase, setPassphrase] = useState('')
  const [offerCode, setOfferCode] = useState('')
  const [responseCode, setResponseCode] = useState('')

  if (!serviceOnline) return null

  const renderFlow = () => {
    if (flow.phase === 'offer-ready') {
      return (
        <div>
          <p>Share this code with the other person:</p>
          <code>{flow.code}</code>
          <div>
            <label htmlFor="response-code">Response code</label>
            <input
              id="response-code"
              value={responseCode}
              onChange={e => setResponseCode(e.target.value)}
            />
            <button onClick={() => store.acceptAnswer(responseCode)}>Connect</button>
          </div>
        </div>
      )
    }

    if (flow.phase === 'answer-ready') {
      return (
        <div>
          <p>Share this response code with the other person:</p>
          <code>{flow.code}</code>
        </div>
      )
    }

    if (flow.phase === 'creating' || flow.phase === 'joining') {
      return <p>Generating...</p>
    }

    if (formMode === 'create') {
      return (
        <form onSubmit={e => { e.preventDefault(); store.createOffer(passphrase) }}>
          <label htmlFor="create-passphrase">Passphrase</label>
          <input
            id="create-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <button type="submit">Generate code</button>
        </form>
      )
    }

    if (formMode === 'join') {
      return (
        <form onSubmit={e => { e.preventDefault(); store.joinOffer(offerCode, passphrase) }}>
          <label htmlFor="join-passphrase">Passphrase</label>
          <input
            id="join-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <label htmlFor="offer-code">Offer code</label>
          <input
            id="offer-code"
            value={offerCode}
            onChange={e => setOfferCode(e.target.value)}
          />
          <button type="submit">Join</button>
        </form>
      )
    }

    return (
      <div>
        <button onClick={() => setFormMode('create')}>Create</button>
        <button onClick={() => setFormMode('join')}>Join</button>
      </div>
    )
  }

  return (
    <section>
      {renderFlow()}
      {peers.length > 0 && (
        <ul>
          {peers.map(peer => (
            <li key={peer.id}>{peer.name ?? 'Unknown'}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
