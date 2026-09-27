import assert from 'node:assert/strict';
import test from 'node:test';
import { maybeRestartRunningCodexApp } from '../codex-app-restart-policy.js';

test('Codex Desktop restarts only when something changed and it is already running', async () => {
  const restarts: string[] = [];
  const restartImpl = async () => {
    restarts.push('restart');
    return { schema: 'sks.codex-app-restart.v1' as const, ok: true, status: 'restarted', app_name: 'ChatGPT', blockers: [] };
  };
  const base = { env: {} as NodeJS.ProcessEnv, changed: true, noRestart: false, platform: 'darwin' as const, restartImpl };
  const cases: Array<[Partial<Parameters<typeof maybeRestartRunningCodexApp>[0]>, boolean, string | null]> = [
    [{ noRestart: true }, true, 'no_restart_flag'],
    [{ changed: false }, true, 'config_unchanged'],
    [{ env: { SKS_SKIP_CODEX_APP_RESTART: '1' } }, true, 'SKS_SKIP_CODEX_APP_RESTART'],
    [{ platform: 'linux' }, true, 'not_macos'],
    [{}, false, 'codex_not_running'],
    [{}, true, null]
  ];
  for (const [override, running, reason] of cases) {
    const outcome = await maybeRestartRunningCodexApp({ ...base, isRunningImpl: async () => running, ...override });
    assert.equal(outcome.reason, reason, JSON.stringify(override));
    assert.equal(outcome.attempted, reason === null, JSON.stringify(override));
    assert.equal(outcome.ok, true);
  }
  assert.deepEqual(restarts, ['restart'], 'SKS never launches or restarts Codex in any skipped case');
});
