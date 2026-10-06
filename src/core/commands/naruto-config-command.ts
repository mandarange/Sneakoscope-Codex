import { codexRestartBlockers, maybeRestartRunningCodexApp, type CodexAppRestartPolicyInput } from '../codex-app/codex-app-restart-policy.js';
import { readNarutoExecutionMode, writeNarutoExecutionMode, type NarutoExecutionMode } from '../subagents/naruto-execution-mode.js';

export async function configureNarutoExecution(input: {
  mode?: NarutoExecutionMode;
  restart?: boolean;
  env?: NodeJS.ProcessEnv;
  restartOptions?: Pick<CodexAppRestartPolicyInput, 'platform' | 'isRunningImpl' | 'restartImpl'>;
}) {
  const env = input.env || process.env;
  try {
    const preference = input.mode
      ? await writeNarutoExecutionMode(input.mode, env)
      : { ...readNarutoExecutionMode(env), changed: false };
    if (preference.blockers.length) return { ...preference, ok: false, restart: null };
    // Explicit Apply retries the restart even if a previous attempt saved the
    // same preference but could not restart the app.
    const restart = input.mode && input.restart
      ? await maybeRestartRunningCodexApp({ env, changed: true, noRestart: false, ...input.restartOptions })
      : null;
    const blockers = restart && !restart.ok
      ? [...restart.blockers, ...codexRestartBlockers(restart)]
      : [];
    return { ...preference, ok: blockers.length === 0, blockers, restart };
  } catch (error) {
    return { ...readNarutoExecutionMode(env), ok: false, changed: false, restart: null,
      blockers: [error instanceof Error ? error.message : 'naruto_execution_config_failed'] };
  }
}
