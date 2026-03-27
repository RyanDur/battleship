import {useState} from 'react';
import {useConnectionState, useConnectionStore} from './useConnection';
import {selectMessages} from './connectionSelectors';
import {sendMessage} from './connectionActions';
import {Alerts} from './Alerts';
import {ChallengeAlert} from '../game/ChallengeAlert';

type Props = {
  peerId: string | null;
  peerName: string | null;
}

export const Comms = ({peerId, peerName}: Props) => {
  const store = useConnectionStore();
  const allMessages = useConnectionState(selectMessages);
  const [messageText, setMessageText] = useState('');
  const [seenCounts, setSeenCounts] = useState<Map<string, number>>(new Map());
  const [isOpen, setIsOpen] = useState(true);

  const messages = peerId ? allMessages.filter(m => m.peerId === peerId) : [];
  const seenCount = peerId ? (seenCounts.get(peerId) ?? 0) : 0;
  const unread = isOpen ? 0 : Math.max(0, messages.length - seenCount);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const open = e.currentTarget.open;
    setIsOpen(open);
    if (open && peerId) {
      setSeenCounts(prev => new Map(prev).set(peerId, messages.length));
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (peerId && messageText.trim()) {
      store.dispatch(sendMessage(peerId, messageText.trim()));
      setMessageText('');
    }
  };

  return (
    <aside className="hud-comms" aria-label="Communications">
      <Alerts/>
      <ChallengeAlert/>
      <details className="comms-details" open aria-label="Comms" onToggle={handleToggle}>
        <summary className="comms-summary">
          Comms
          {!isOpen && lastMessage && (
            <span className="comms-last-message">
              {lastMessage.fromSelf ? 'You' : peerName}: {lastMessage.text}
            </span>
          )}
          <output className="comms-unread" aria-live="polite">{unread > 0 ? String(unread) : ''}</output>
        </summary>

        {peerId && (
          <article className="comms-conversation">
            {messages.length > 0 && (
              <ol className="comms-messages">
                {messages.map((m, i) => (
                  <li className={`comms-message ${m.fromSelf ? 'sent' : 'received'}`} key={i}>
                    {m.fromSelf ? 'You' : peerName}: {m.text}
                  </li>
                ))}
              </ol>
            )}
            <form className="comms-form" onSubmit={handleSend}>
              <label className="comms-label" htmlFor="comms-input">Message</label>
              <input
                className="field"
                id="comms-input"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
              />
              <button className="control" type="submit">Send</button>
            </form>
          </article>
        )}
      </details>
    </aside>
  );
};
