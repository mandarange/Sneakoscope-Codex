import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexAppServerV2Client } from '../codex-app-server-v2-client.js';

test('turn completion wait consumes a matching notification that arrived before the listener was attached', async () => {
  const client = new CodexAppServerV2Client({ command: '/usr/bin/false' });
  client.handleStdout(Buffer.from(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/completed',
    params: {
      threadId: 'thread-1',
      turn: {
        id: 'turn-1',
        status: 'completed',
        items: []
      }
    }
  })}\n`));

  const event = await client.waitForTurnCompletion('thread-1', 'turn-1', 50);

  assert.equal(event.method, 'turn/completed');
  assert.equal((event.params as { threadId?: string }).threadId, 'thread-1');
});
