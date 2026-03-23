import type {Board} from './board';

export const hashBoard = async (board: Board): Promise<string> => {
  const data = new TextEncoder().encode(JSON.stringify(board.placed));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
