import {asyncResult, asyncTryCatch, asyncSuccess, asyncFailure, type AsyncResult} from '../lib/asyncResult';
import type {Board} from '../game/board';
import {HttpError} from './http';

export const saveBoard = (serviceUrl: string, board: Board): AsyncResult<void, Error> =>
  asyncResult<Response, Error>(fetch(`${serviceUrl}/board`, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    credentials: 'include',
    body: JSON.stringify(board),
  }))
  .andThen(response => response.ok
    ? asyncSuccess<void, Error>(undefined)
    : asyncFailure(new HttpError(response.status)));

export const loadBoard = (serviceUrl: string): AsyncResult<Board | null, Error> =>
  asyncResult<Response, Error>(fetch(`${serviceUrl}/board`, {credentials: 'include'}))
  .andThen(response => {
    if (response.status === 404) return asyncSuccess<Board | null, Error>(null);
    if (!response.ok) return asyncFailure(new HttpError(response.status));
    return asyncTryCatch<Board>(() => response.text().then(text => JSON.parse(text) as Board));
  });
