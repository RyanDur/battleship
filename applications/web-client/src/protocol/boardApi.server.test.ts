import type {IncomingMessage, ServerResponse} from 'node:http';
import {saveBoard, loadBoard} from './boardApi';
import {createStubServer} from '../test/stubServer';
import type {Board} from '../game/board';

const board: Board = {
  placed: [{
    ship: {name: 'Carrier', size: 5},
    position: {row: 1, col: 1},
    orientation: 'horizontal',
  }],
};

const boardJson = JSON.stringify(board);

describe('saveBoard', () => {
  it('returns success when server responds 200', async () => {
    const server = await createStubServer({
      routes: {
        'POST /board': (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(200);
          res.end();
        },
      },
    });
    try {
      const result = await saveBoard(server.url, board).value;
      expect(result.kind).toBe('success');
    } finally {
      await server.close();
    }
  });

  it('returns failure when server responds with an error', async () => {
    const server = await createStubServer({
      routes: {
        'POST /board': (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(500);
          res.end();
        },
      },
    });
    try {
      const result = await saveBoard(server.url, board).value;
      expect(result.kind).toBe('failure');
    } finally {
      await server.close();
    }
  });

  it('returns failure when server is unreachable', async () => {
    const result = await saveBoard('http://127.0.0.1:1', board).value;
    expect(result.kind).toBe('failure');
  });
});

describe('loadBoard', () => {
  it('returns the board when server responds 200', async () => {
    const server = await createStubServer({
      routes: {
        'GET /board': (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end(boardJson);
        },
      },
    });
    try {
      const result = await loadBoard(server.url).value;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.value).toEqual(board);
    } finally {
      await server.close();
    }
  });

  it('returns null when server responds 404', async () => {
    const server = await createStubServer({
      routes: {
        'GET /board': (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(404);
          res.end();
        },
      },
    });
    try {
      const result = await loadBoard(server.url).value;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.value).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('returns failure when server responds with an error', async () => {
    const server = await createStubServer({
      routes: {
        'GET /board': (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(500);
          res.end();
        },
      },
    });
    try {
      const result = await loadBoard(server.url).value;
      expect(result.kind).toBe('failure');
    } finally {
      await server.close();
    }
  });

  it('returns failure when server is unreachable', async () => {
    const result = await loadBoard('http://127.0.0.1:1').value;
    expect(result.kind).toBe('failure');
  });
});
