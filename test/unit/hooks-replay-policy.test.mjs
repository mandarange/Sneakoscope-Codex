import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHookPayload, honestModeGapLines } from '../../src/core/hooks-runtime.mjs';

test('shared hook runtime blocks destructive DB pre-tool payload', async () => {
  const result = await evaluateHookPayload('pre-tool', {
    tool_input: { command: 'psql -c "DROP TABLE users"' }
  }, { root: process.cwd(), state: {} });
  assert.equal(result.decision, 'block');
});

test('honest loopback ignores resolved empty-gap summary lines', () => {
  const text = [
    '**완료 요약**',
    '0.9.13 release contract를 검증하고 proof를 갱신했습니다.',
    '**SKS Honest Mode**',
    '- proof validation: `verified`, `unverified: []`, `blockers: []`',
    '- 미해결 gap: 없음, sealed 0.9.13 contract 기준.',
    '- Unresolved gaps for the 0.9.13 sealed contract: none.'
  ].join('\n');
  assert.deepEqual(honestModeGapLines(text), []);
});
