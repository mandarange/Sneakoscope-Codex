// Default fast path for `sks hook <event>` (SKS_HOOK_DAEMON=0 opts out — see
// sks-dispatch.ts). Tries the sksd hook daemon first; on any failure to
// reach it, spawns the daemon in the background for next time and falls
// back to running the exact same evaluateHookPayload()/normalizeHookResult()
// logic the default path uses, so behavior is identical either way — only
// the latency differs (20차 P2-1).
//
// Lives under core/daemon rather than bin/ deliberately: dist/bin/ is
// force-loaded as CommonJS by build-dist.ts's writeCommonJsBinScope() via a
// hand-maintained per-file rewrite list, which this file isn't on — as a
// plain ESM module under core/, sks-dispatch.ts's dynamic import() of it
// works regardless of dist/bin/'s module-type override.
import { callSksdHookDaemon, SKSD_VERSION_MISMATCH_ERROR, spawnSksdHookDaemonDetached } from './sksd-hook-daemon.js';
import { hasPerProcessHookEnv } from './sksd-hook-env.js';
// loadHookPayload/normalizeHookResult come from the lightweight hook-io
// module, not hooks-runtime.js directly — hooks-runtime.js pulls in ~20
// domain modules (pipeline, mission, db-safety, harness-guard, ...) that a
// daemon-hit call has no reason to load. evaluateHookPayload (the heavy
// one) is dynamically imported below, only on the fallback path.
import { loadHookPayload, normalizeHookResult } from '../hooks-runtime/hook-io.js';
import { ensureSksStateGitExcluded, hookLayerDeferral, hookLayerFromArgs } from '../hooks-runtime/hook-layer.js';
import { packageRoot, projectRoot } from '../fsx.js';

export async function hookDaemonInline(name: string, extraArgs: readonly string[] = []): Promise<void> {
  const payload = await loadHookPayload();
  const root = await projectRoot(payload.cwd || process.cwd());
  const layer = hookLayerFromArgs(extraArgs);
  const deferral = await hookLayerDeferral({ layer, hookName: name, root, runningPackageRoot: packageRoot() })
    .catch(() => ({ defer: false, reason: 'deferral_check_failed' }));
  if (deferral.defer) {
    process.stdout.write(`${JSON.stringify(normalizeHookResult(name, { suppressedDuplicate: true }))}\n`);
    return;
  }
  let result: unknown;
  try {
    // A worker or standalone Naruto parent decides with its own markers, which
    // the shared daemon must not see or lend to other sessions (sksd-hook-env.ts).
    const daemonResponse = hasPerProcessHookEnv(process.env) ? null : await callSksdHookDaemon(root, name, payload);
    if (daemonResponse?.ok) {
      result = daemonResponse.result;
    } else {
      // Spawn only when no daemon answered or the one that did has retired;
      // a daemon that refused this caller's environment stays and serves others.
      const retired = daemonResponse?.error === SKSD_VERSION_MISMATCH_ERROR;
      if (!hasPerProcessHookEnv(process.env) && (!daemonResponse || retired)) spawnSksdHookDaemonDetached(root);
      const { evaluateHookPayloadOnce } = await import('../hooks-runtime.js');
      result = await evaluateHookPayloadOnce(name, payload, { root });
    }
  } catch (err: unknown) {
    // The user-level hook runs in every project, so an SKS failure there must
    // never break the Codex turn: report it and let the turn continue.
    if (layer !== 'user') throw err;
    process.stderr.write(`SKS hook ${name} failed: ${err instanceof Error ? err.message : String(err)}\n`);
    result = { suppressedDuplicate: true };
  }
  await ensureSksStateGitExcluded(root).catch(() => null);
  process.stdout.write(`${JSON.stringify(normalizeHookResult(name, result))}\n`);
}
