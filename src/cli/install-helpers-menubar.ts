import { stdin as input, stdout as output } from 'node:process';
import { globalSksRoot } from '../core/fsx.js';
import { installSksMenuBar, sksMenuBarRestartDeferred } from '../core/codex-app/menubar/installer.js';

export interface PostinstallMenuBarPolicy {
  install: boolean;
  launch: boolean;
  reason: string;
}

export interface PostinstallMenuBarIo {
  stdinTTY: boolean;
  stdoutTTY: boolean;
}

/**
 * When `npm install` may also install the SKS Menu Bar + Control Center.
 *
 * The package-local default stays inert: a dependency install inside a
 * project, a CI run, or a piped/non-interactive install never writes HOME.
 * A human running a global install in a terminal on macOS is the one case
 * where the app is expected to arrive with the CLI, so that case installs
 * it. `SKS_POSTINSTALL_MENUBAR=1` forces it for scripted installs and
 * `SKS_POSTINSTALL_NO_MENUBAR=1` (or the general `SKS_POSTINSTALL_NO_BOOTSTRAP=1`)
 * always turns it off. The broad lifecycle opt-in (`SKS_POSTINSTALL_BOOTSTRAP=1`)
 * does not imply a Swift build: fixtures and hermetic checks use it in
 * throwaway homes where a compile would only cost time.
 */
export function postinstallMenuBarPolicy(
  env: NodeJS.ProcessEnv,
  io: PostinstallMenuBarIo,
  platform: NodeJS.Platform = process.platform
): PostinstallMenuBarPolicy {
  const launch = !sksMenuBarRestartDeferred(env);
  if (env.SKS_POSTINSTALL_NO_BOOTSTRAP === '1') return { install: false, launch: false, reason: 'SKS_POSTINSTALL_NO_BOOTSTRAP=1' };
  if (env.SKS_POSTINSTALL_NO_MENUBAR === '1') return { install: false, launch: false, reason: 'SKS_POSTINSTALL_NO_MENUBAR=1' };
  if (platform !== 'darwin') return { install: false, launch: false, reason: `platform:${platform}` };
  if (env.SKS_POSTINSTALL_MENUBAR === '1') return { install: true, launch, reason: 'forced by SKS_POSTINSTALL_MENUBAR=1' };
  if (env.npm_config_global !== 'true') return { install: false, launch: false, reason: 'not a global npm install' };
  if (env.CI === 'true' || env.CI === '1') return { install: false, launch: false, reason: 'CI' };
  if (!io.stdinTTY || !io.stdoutTTY) return { install: false, launch: false, reason: 'non-interactive install' };
  return { install: true, launch, reason: 'interactive global npm install on macOS' };
}

export interface PostinstallMenuBarOutcome {
  status: 'installed' | 'up_to_date' | 'skipped' | 'blocked' | 'failed';
  reason: string;
  app_path: string | null;
  launched: boolean;
  blockers: string[];
}

/** Installs the Menu Bar + Control Center when the policy allows; never throws, never fails npm install. */
export async function ensureSksMenuBarDuringPostinstall(
  env: NodeJS.ProcessEnv = process.env,
  io: PostinstallMenuBarIo = { stdinTTY: Boolean(input.isTTY), stdoutTTY: Boolean(output.isTTY) },
  installer: typeof installSksMenuBar = installSksMenuBar
): Promise<PostinstallMenuBarOutcome> {
  const policy = postinstallMenuBarPolicy(env, io);
  if (!policy.install) return { status: 'skipped', reason: policy.reason, app_path: null, launched: false, blockers: [] };
  try {
    const result = await installer({ root: globalSksRoot(), apply: true, launch: policy.launch, env, quiet: true });
    const blockers = Array.isArray(result.blockers) ? result.blockers.map(String) : [];
    if (!result.ok) return { status: 'blocked', reason: policy.reason, app_path: result.app_path ?? null, launched: false, blockers };
    const upToDate = Array.isArray(result.actions) && result.actions.includes('menubar_up_to_date');
    return {
      status: upToDate ? 'up_to_date' : 'installed',
      reason: policy.reason,
      app_path: result.app_path ?? null,
      launched: result.launch?.ok === true && result.launch?.requested === true,
      blockers
    };
  } catch (error: unknown) {
    return { status: 'failed', reason: policy.reason, app_path: null, launched: false, blockers: [error instanceof Error ? error.message : String(error)] };
  }
}

export function describePostinstallMenuBar(outcome: PostinstallMenuBarOutcome): string {
  switch (outcome.status) {
    case 'installed':
      return `SKS Menu Bar + Control Center: installed at ${outcome.app_path ?? 'unknown path'}${outcome.launched ? ' and started' : ' (start it with `sks menubar restart`)'} (${outcome.reason}).`;
    case 'up_to_date':
      return `SKS Menu Bar + Control Center: already current at ${outcome.app_path ?? 'unknown path'}.`;
    case 'blocked':
      return `SKS Menu Bar + Control Center: not installed (${outcome.blockers.join(', ') || 'blocked'}). Run \`sks menubar install\` after fixing the blocker.`;
    case 'failed':
      return `SKS Menu Bar + Control Center: install failed (${outcome.blockers.join(', ')}). Run \`sks menubar install\`.`;
    default:
      return `SKS Menu Bar + Control Center: not installed during npm install (${outcome.reason}). Run \`sks install\` or \`sks menubar install\` to add it.`;
  }
}
