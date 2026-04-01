import type {ReactNode} from 'react';
import {useSelector, useDispatch} from './useStore';
import {selectPendingIntroductions} from './connectionSelectors';
import {acceptIntroduction, declineIntroduction} from './connectionActions';

type Props = {
  children?: ReactNode;
};

export const Alerts = ({children}: Props) => {
  const dispatch = useDispatch();
  const pendingIntroductions = useSelector(selectPendingIntroductions);

  const count = pendingIntroductions.length;

  return (
    <details className="alerts-details" open aria-label="Alerts">
      <summary className="alerts-summary">
        Alerts
        <output className="alerts-count" aria-live="assertive">{count > 0 ? String(count) : ''}</output>
      </summary>

      {children}

      {count > 0 && (
        <ul className="alerts-list">
          {pendingIntroductions.map(intro => (
            <li key={intro.introId}>
              <article className="alerts-alert">
                {intro.from} wants to introduce you to {intro.peer}
                <button className="control" onClick={() => dispatch(acceptIntroduction(intro.introId))}>Accept</button>
                <button className="control" onClick={() => dispatch(declineIntroduction(intro.introId))}>Decline</button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
};
