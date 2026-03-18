import {useState} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectMessages} from '../state/connectionSelectors';
import {sendMessage} from '../state/connectionActions';

type Props = {
  peerId: string | null;
  peerName: string | null;
}

export const Comms = ({peerId, peerName}: Props) => {
  const store = useConnectionStore();
  const allMessages = useConnectionState(selectMessages);
  const [messageText, setMessageText] = useState('');
  const [seenCount, setSeenCount] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  const messages = peerId ? allMessages.filter(m => m.peerId === peerId) : [];
  const unread = isOpen ? 0 : Math.max(0, messages.length - seenCount);

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const open = e.currentTarget.open;
    setIsOpen(open);
    if (open) setSeenCount(messages.length);
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
      <details className="comms-details" open onToggle={handleToggle}>
        <summary className="comms-summary">
          Comms <output className="comms-unread" aria-live="polite">{unread > 0 ? String(unread) : ''}</output>
        </summary>

        {peerId && (
          <article className="comms-conversation">
            {messages.length > 0 && (
              <ol className="comms-messages">
                {messages.map((m, i) => (
                  <li className={`comms-message ${m.fromSelf ? 'comms-message--sent' : 'comms-message--received'}`} key={i}>
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
