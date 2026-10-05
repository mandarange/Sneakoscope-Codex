import { createHash } from 'node:crypto';

/**
 * Hook decisions read the process environment: the agent recursion guard
 * (`SKS_AGENT_WORKER`, the generation depth), standalone Naruto parent attach
 * (`SKS_NARUTO_PARENT_*`), the verification profile, Jev's provider key. The
 * warm daemon evaluates hooks in its own process, so its environment — whatever
 * the hook process that first spawned it had — used to stand in for every
 * caller's: a daemon spawned by a worker treated every later session in the
 * project as a worker, and a worker talking to a plain daemon escaped its
 * recursion guard.
 *
 * Two rules keep the daemon's decisions identical to an inline evaluation:
 * a caller whose environment carries per-process markers evaluates inline,
 * and every request carries a fingerprint of the decision-relevant environment
 * that the daemon must match, or the caller evaluates inline.
 */

/** Set by SKS for one process tree (a worker, a standalone parent); never shared through the daemon. */
const PER_PROCESS_HOOK_ENV = /^SKS_(?:AGENT_|NARUTO_PARENT_|NARUTO_APP_SESSION$|NARUTO_STANDALONE_CLI$|DISABLE_ROUTE_RECURSION$)/;
/** Decision-irrelevant SKS variables: the daemon switch itself. */
const FINGERPRINT_IGNORED = new Set(['SKS_HOOK_DAEMON']);
/** Provider keys count by presence only; their values never enter a fingerprint. */
const PRESENCE_ONLY = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY'];

export function hasPerProcessHookEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.keys(env).some((key) => PER_PROCESS_HOOK_ENV.test(key) && String(env[key] ?? '') !== '');
}

/** The environment the daemon is started with: no per-process markers, no caller thread. */
export function daemonSpawnEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (PER_PROCESS_HOOK_ENV.test(key) || key === 'CODEX_THREAD_ID') continue;
    next[key] = value;
  }
  return next;
}

export function hookDecisionEnvFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const entries = Object.keys(env)
    .filter((key) => key.startsWith('SKS_') && !FINGERPRINT_IGNORED.has(key) && !PER_PROCESS_HOOK_ENV.test(key))
    .sort()
    .map((key) => [key, String(env[key] ?? '')]);
  const material = {
    sks: entries,
    home: String(env.HOME ?? ''),
    codex_home: String(env.CODEX_HOME ?? ''),
    keys: PRESENCE_ONLY.map((key) => [key, Boolean(env[key])]),
  };
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 32);
}
