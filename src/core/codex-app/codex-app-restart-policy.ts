import { isCodexAppRunningByBundleId } from './menubar/config.js'
import { restartCodexApp } from './codex-app-restart.js'

/**
 * When SKS changes what an already-running Codex Desktop reads only at launch
 * (its model line, the model catalog), it restarts Codex — and only then.
 *
 * The policy is the one `sks codex-app context-1m` ships: nothing changed, an
 * explicit `--no-restart`, `SKS_SKIP_CODEX_APP_RESTART=1`, or a host that is not
 * macOS all skip, and a Codex that is not running is left alone. SKS never
 * launches Codex on its own; the new config applies at the next launch.
 */
export interface CodexAppRestartOutcome {
  attempted: boolean
  running: boolean | null
  status: string
  reason: string | null
  ok: boolean
  blockers: string[]
}

export const CODEX_RESTART_FAILED_BLOCKER = 'codex_restart_failed_manual_restart_required';

export function codexRestartBlockers(restart: CodexAppRestartOutcome | null): string[] {
  return restart?.attempted && !restart.ok ? [CODEX_RESTART_FAILED_BLOCKER] : [];
}

export interface CodexAppRestartPolicyInput {
  env: NodeJS.ProcessEnv
  changed: boolean
  noRestart: boolean
  platform?: NodeJS.Platform
  root?: string
  isRunningImpl?: typeof isCodexAppRunningByBundleId
  restartImpl?: typeof restartCodexApp
}

export async function maybeRestartRunningCodexApp(input: CodexAppRestartPolicyInput): Promise<CodexAppRestartOutcome> {
  const skipped = (reason: string): CodexAppRestartOutcome => (
    { attempted: false, running: null, status: 'skipped', reason, ok: true, blockers: [] }
  )
  if (input.noRestart) return skipped('no_restart_flag')
  if (!input.changed) return skipped('config_unchanged')
  if (input.env.SKS_SKIP_CODEX_APP_RESTART === '1') return skipped('SKS_SKIP_CODEX_APP_RESTART')
  if ((input.platform || process.platform) !== 'darwin') return skipped('not_macos')
  const bundleId = String(input.env.SKS_CODEX_APP_BUNDLE_ID || 'com.openai.codex')
  const running = await (input.isRunningImpl || isCodexAppRunningByBundleId)(bundleId, input.env)
  if (!running) {
    return { attempted: false, running: false, status: 'skipped', reason: 'codex_not_running', ok: true, blockers: [] }
  }
  const result = await (input.restartImpl || restartCodexApp)({ env: input.env, ...(input.root ? { root: input.root } : {}) })
  return { attempted: true, running: true, status: result.status, reason: null, ok: result.ok, blockers: [...result.blockers] }
}
