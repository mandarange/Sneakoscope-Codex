import { runProcess, which } from '../../fsx.js';
import { SECRET_LAUNCH_ENV_KEYS } from './constants.js';
import type { SecretLaunchEnvCleanupResult } from './types.js';

export async function cleanupMacLaunchSecretEnvironment(opts: {
  env?: NodeJS.ProcessEnv;
  force?: boolean;
} = {}): Promise<SecretLaunchEnvCleanupResult> {
  if (process.platform !== 'darwin' && !opts.force) {
    return { ok: true, status: 'not_macos', variables: [...SECRET_LAUNCH_ENV_KEYS], cleaned: [], failed: [], next_actions: [] };
  }
  const env = opts.env || process.env;
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  if (!launchctl) {
    return {
      ok: false, status: 'launchctl_missing', variables: [...SECRET_LAUNCH_ENV_KEYS], cleaned: [],
      failed: SECRET_LAUNCH_ENV_KEYS.map((key) => ({ key, error: 'launchctl_missing' })),
      next_actions: SECRET_LAUNCH_ENV_KEYS.map((key) => `Run: launchctl unsetenv ${key}`)
    };
  }
  const cleaned: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const key of SECRET_LAUNCH_ENV_KEYS) {
    const result = await runProcess(launchctl, ['unsetenv', key], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 })
      .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
    if (result.code === 0) cleaned.push(key);
    else failed.push({ key, error: String(result.stderr || result.stdout || 'launchctl unsetenv failed').trim() });
  }
  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'cleaned' : 'partial',
    variables: [...SECRET_LAUNCH_ENV_KEYS], cleaned, failed,
    next_actions: ['Rotate credentials if they were previously exposed in the launchd environment.']
  };
}
