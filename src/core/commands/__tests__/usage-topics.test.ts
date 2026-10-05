import test from 'node:test';
import assert from 'node:assert/strict';
import { USAGE_TOPICS } from '../../routes/constants.js';
import { usageCommand } from '../basic-cli.js';

test('every advertised usage topic resolves to a command, route, or guide', () => {
  const topics = USAGE_TOPICS.split('|');
  assert.ok(topics.length > 0);
  const previousLog = console.log;
  try {
    for (const topic of topics) {
      const lines: string[] = [];
      console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
      usageCommand([topic]);
      assert.doesNotMatch(lines.join('\n'), /Unknown usage topic/, `usage topic "${topic}" is advertised but does not resolve`);
    }
  } finally {
    console.log = previousLog;
  }
});
