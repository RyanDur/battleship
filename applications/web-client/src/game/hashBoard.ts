import type {Board} from './board';
import {asyncTryCatch} from '../lib/asyncResult';
import type {AsyncResult} from '../lib/asyncResult';

export const hashBoard = (board: Board): AsyncResult<string, Error> =>
  asyncTryCatch(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(board.placed)))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
  );
