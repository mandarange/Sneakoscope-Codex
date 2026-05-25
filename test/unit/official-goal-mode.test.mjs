import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOfficialGoalMode } from '../../dist/core/codex/official-goal-mode.js';

test('defaults official Goal mode when available and falls back otherwise', async () => {
  const official = await detectOfficialGoalMode({ runCommand: false, codexHelpText: 'codex /goal create', codexGoalHelpText: 'goal help' });
  assert.equal(official.official_goal_available, true);
  assert.equal(official.default_enabled, true);
  const fallback = await detectOfficialGoalMode({ runCommand: false, codexHelpText: 'codex help' });
  assert.equal(fallback.mode, 'sks_goal_fallback');
});
