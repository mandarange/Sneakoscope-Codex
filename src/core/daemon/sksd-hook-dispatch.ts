// Opt-in fast path for `sks hook <event>` (SKS_HOOK_DAEMON=1 only — see
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
import { callSksdHookDaemon, spawnSksdHookDaemonDetached } from './sksd-hook-daemon.js';
// loadHookPayload/normalizeHookResult come from the lightweight hook-io
// module, not hooks-runtime.js directly — hooks-runtime.js pulls in ~20
// domain modules (pipeline, mission, db-safety, harness-guard, ...) that a
// daemon-hit call has no reason to load. evaluateHookPayload (the heavy
// one) is dynamically imported below, only on the fallback path.
import { loadHookPayload, normalizeHookResult } from '../hooks-runtime/hook-io.js';
import { projectRoot } from '../fsx.js';

export async function hookDaemonInline(name: string): Promise<void> {
  const payload = await loadHookPayload();
  const root = await projectRoot(payload.cwd || process.cwd());
  const daemonResponse = await callSksdHookDaemon(root, name, payload);
  let result: unknown;
  if (daemonResponse) {
    result = daemonResponse.result;
  } else {
    spawnSksdHookDaemonDetached(root);
    const { evaluateHookPayload } = await import('../hooks-runtime.js');
    result = await evaluateHookPayload(name, payload, { root });
  }
  process.stdout.write(`${JSON.stringify(normalizeHookResult(name, result))}\n`);
}
