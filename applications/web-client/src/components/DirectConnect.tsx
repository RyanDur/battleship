import {useState} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import type {ConnectionFlow} from '../state/connections';
import {selectFlow} from '../state/connectionSelectors';
import {acceptAnswerCode, cancelOffer, createOffer, joinOffer} from '../state/connectionActions';

type FlowPhase =
  | {phase: 'idle'}
  | {phase: 'creating'}
  | {phase: 'offer-ready'; code: string}
  | {phase: 'offer-failed'}
  | {phase: 'joining'}
  | {phase: 'answer-ready'; code: string}

const toFlowPhase = (flow: ConnectionFlow): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code};
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code};
  if (flow.phase === 'encoding-offer') return {phase: 'creating'};
  if (flow.phase === 'encoding-answer') return {phase: 'joining'};
  return {phase: flow.phase};
};

type Props = {
  serviceOnline: boolean
}

export const DirectConnect = ({serviceOnline}: Props) => {
  const store = useConnectionStore();
  const flow = toFlowPhase(useConnectionState(selectFlow));

  const [formMode, setFormMode] = useState<'none' | 'create' | 'join'>('none');
  const [prevPhase, setPrevPhase] = useState(flow.phase);

  if (prevPhase !== flow.phase) {
    setPrevPhase(flow.phase);
    if (flow.phase === 'idle') setFormMode('none');
  }
  const [passphrase, setPassphrase] = useState('');
  const [offerCode, setOfferCode] = useState('');
  const [responseCode, setResponseCode] = useState('');

  if (!serviceOnline) return null;

  if (flow.phase === 'offer-ready') {
    return (
      <section className="direct-connect">
        <p className="direct-connect-label">Share this code with the other person:</p>
        <code className="direct-connect-code">{flow.code}</code>
        <form onSubmit={e => { e.preventDefault(); store.dispatch(acceptAnswerCode(responseCode)); }}>
          <label htmlFor="response-code">Response code</label>
          <input
            className="field"
            id="response-code"
            value={responseCode}
            onChange={e => setResponseCode(e.target.value)}
          />
          <button className="control" type="submit">Accept</button>
        </form>
      </section>
    );
  }

  if (flow.phase === 'answer-ready') {
    return (
      <section className="direct-connect">
        <p className="direct-connect-label">Share this response code with the other person:</p>
        <code className="direct-connect-code">{flow.code}</code>
      </section>
    );
  }

  if (flow.phase === 'offer-failed') {
    return (
      <section className="direct-connect">
        <p className="direct-connect-label">Failed to generate a code. Please try again.</p>
        <button className="control" onClick={() => store.dispatch(cancelOffer())}>Cancel</button>
      </section>
    );
  }

  if (flow.phase === 'creating' || flow.phase === 'joining') {
    return (
      <section className="direct-connect">
        <p className="direct-connect-label">Generating...</p>
      </section>
    );
  }

  if (formMode === 'create') {
    return (
      <section className="direct-connect">
        <form onSubmit={e => { e.preventDefault(); store.dispatch(createOffer(passphrase)); }}>
          <label htmlFor="create-passphrase">Passphrase</label>
          <input
            className="field"
            id="create-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <button className="control" type="submit">Generate code</button>
        </form>
      </section>
    );
  }

  if (formMode === 'join') {
    return (
      <section className="direct-connect">
        <form onSubmit={e => { e.preventDefault(); store.dispatch(joinOffer(offerCode, passphrase)); }}>
          <label htmlFor="join-passphrase">Passphrase</label>
          <input
            className="field"
            id="join-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <label htmlFor="offer-code">Offer code</label>
          <input
            className="field"
            id="offer-code"
            value={offerCode}
            onChange={e => setOfferCode(e.target.value)}
          />
          <button className="control" type="submit">Join</button>
        </form>
      </section>
    );
  }

  return (
    <section className="direct-connect">
      <button className="control" onClick={() => setFormMode('create')}>Create</button>
      <button className="control" onClick={() => setFormMode('join')}>Join</button>
    </section>
  );
};
