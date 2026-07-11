import assert from 'node:assert/strict';
import test from 'node:test';
import { codexFeatureList, codexMcpList } from '../codex-app.js';

test('Codex MCP and feature probes redact credentials before reports can persist them', async () => {
  const secrets = [
    'dXNlcjpwYXNzd29yZA==',
    'opaque-session-secret-123456',
    'opaque-custom-secret-123456'
  ];
  const runProcess = async () => ({
    code: 0,
    stdout: `browser enabled\nAuthorization: Basic ${secrets[0]}\nCookie: session=${secrets[1]}`,
    stderr: `X-Custom-Auth: ${secrets[2]}`
  });

  for (const result of [
    await codexMcpList({ codex: { bin: '/fixture/codex' }, runProcess }),
    await codexFeatureList({ codex: { bin: '/fixture/codex' }, runProcess })
  ]) {
    const serialized = JSON.stringify(result);
    for (const secret of secrets) assert.doesNotMatch(serialized, new RegExp(secret));
    assert.match(result.stdout, /browser enabled/);
    assert.match(serialized, /redacted/i);
  }
});
