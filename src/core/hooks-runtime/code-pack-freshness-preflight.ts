import path from 'node:path';
import { exists, readJson, runProcess } from '../fsx.js';

/** Bounded, non-blocking code-pack staleness nudge for the user-prompt-submit hook.
 *
 * Returns a one-line context note when a published code pack
 * (.sneakoscope/wiki/code-pack.json) exists but was generated against a different
 * git HEAD than the current one — i.e. the codebase moved and the LLM-facing code
 * summaries are now out of date. Returns null (silent) when there is no pack at all
 * (repos that never opted into `sks wiki refresh --code` must not be nagged) or when
 * the check can't complete cheaply. It NEVER regenerates the pack and NEVER blocks:
 * the whole check is one JSON read plus one `git rev-parse HEAD`, wrapped in a hard
 * timeout so it cannot blow the hook latency budget. Any failure resolves to null. */
export async function codePackFreshnessNote(root: string, opts: { budgetMs?: number } = {}): Promise<string | null> {
  const budgetMs = opts.budgetMs ?? 250;
  return raceWithTimeout(computeNote(root), budgetMs).catch(() => null);
}

async function computeNote(root: string): Promise<string | null> {
  const packPath = path.join(root, '.sneakoscope', 'wiki', 'code-pack.json');
  if (!(await exists(packPath))) return null;
  const pack = await readJson<any>(packPath, null).catch(() => null);
  const packSha = pack?.git_head_sha || null;
  // A pack with no recorded sha (non-git build) can't be compared; stay silent
  // rather than nag with a comparison we can't actually make.
  if (!packSha) return null;
  const head = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, timeoutMs: 200 }).catch(() => null);
  const currentSha = head && head.code === 0 ? String(head.stdout || '').trim() : null;
  if (!currentSha || currentSha === packSha) return null;
  return 'SKS note: the codebase code pack is stale (HEAD moved since it was built). Run `sks wiki refresh --code` to refresh source-cited code context.';
}

async function raceWithTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    if (timer.unref) timer.unref();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
