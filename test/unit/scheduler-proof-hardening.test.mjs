import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('scheduler proof hardening blockers are source-bound', () => {
  const source = fs.readFileSync('src/core/agents/agent-proof-evidence.ts', 'utf8');
  assert.match(source, /agent_work_queue_missing/);
  assert.match(source, /scheduler_backfill_count_below_expected/);
  assert.match(source, /terminal_close_report_count_below_generation_count/);
});
