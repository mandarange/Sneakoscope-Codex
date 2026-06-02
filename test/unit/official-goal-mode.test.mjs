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

test('detects official Goal mode from Codex feature list without goal subcommand help', async () => {
  const official = await detectOfficialGoalMode({
    runCommand: false,
    codexHelpText: 'Codex CLI',
    codexGoalHelpText: '',
    codexFeaturesText: 'goals stable true\nremote_control removed false\n'
  });
  assert.equal(official.official_goal_available, true);
  assert.equal(official.codex_goals_feature_enabled, true);
  assert.equal(official.codex_features_checked, true);
  assert.equal(official.mode, 'official_goal_default');
});
