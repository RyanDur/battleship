import {WebSocket} from 'ws';

export const makeWebSocket = (url: string): globalThis.WebSocket =>
  new WebSocket(url) as unknown as globalThis.WebSocket;
