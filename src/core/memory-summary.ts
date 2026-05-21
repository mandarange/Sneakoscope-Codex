import path from 'node:path';
import { exists, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from './fsx.js';
import { writeWrongnessSummaries, summarizeWrongness } from './triwiki-wrongness/wrongness-ledger.js';

export const TRIWIKI_SUMMARY_SCHEMA_VERSION = 2;
export const WRONGNESS_SUMMARY_SCHEMA_VERSION = 2;
export const SHARED_MEMORY_SUMMARY_SCHEMA_VERSION = 2;

export function memorySummaryPath(root: string) {
  return path.join(root, '.sneakoscope', 'wiki', 'memory-summary.json');
}

export async function rebuildMemorySummaries(root: string, opts: any = {}) {
  await writeWrongnessSummaries(root, opts.missionId || null);
  const contextPackPath = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  const contextPack = await readJson<any>(contextPackPath, null);
  const wrongness = await summarizeWrongness(root, opts.missionId || null);
  const stale = await staleSummaryStatus(root, contextPack);
  const summary = {
    schema: 'sks.memory-summary.v2',
    schema_version: TRIWIKI_SUMMARY_SCHEMA_VERSION,
    generated_at: nowIso(),
    codex_0_133_behavior: 'versioned_summary_rebuild',
    codex_0_132_behavior: 'versioned_summary_rebuild',
    summaries: {
      triwiki: {
        schema_version: TRIWIKI_SUMMARY_SCHEMA_VERSION,
        context_pack: await exists(contextPackPath) ? '.sneakoscope/wiki/context-pack.json' : null,
        claims: contextPack?.claims?.length || 0,
        stale: stale.triwiki_stale,
        rebuild_recommended: stale.triwiki_stale
      },
      wrongness: {
        schema_version: WRONGNESS_SUMMARY_SCHEMA_VERSION,
        total: wrongness.total || 0,
        active: wrongness.active || 0,
        stale: false,
        rebuild_recommended: false
      },
      shared_memory: {
        schema_version: SHARED_MEMORY_SUMMARY_SCHEMA_VERSION,
        stale: stale.shared_memory_stale,
        rebuild_recommended: stale.shared_memory_stale
      }
    },
    ok: true
  };
  await writeJsonAtomic(memorySummaryPath(root), summary);
  await writeTextAtomic(path.join(root, '.sneakoscope', 'wiki', 'memory-summary.md'), renderMemorySummary(summary));
  return summary;
}

async function staleSummaryStatus(root: string, contextPack: any) {
  const summaryFile = memorySummaryPath(root);
  if (!(await exists(summaryFile))) {
    return { triwiki_stale: false, shared_memory_stale: false };
  }
  const current = await readJson<any>(summaryFile, null);
  return {
    triwiki_stale: Number(current?.schema_version || 0) < TRIWIKI_SUMMARY_SCHEMA_VERSION
      || Number(contextPack?.summary_schema_version || TRIWIKI_SUMMARY_SCHEMA_VERSION) < TRIWIKI_SUMMARY_SCHEMA_VERSION,
    shared_memory_stale: Number(current?.summaries?.shared_memory?.schema_version || 0) < SHARED_MEMORY_SUMMARY_SCHEMA_VERSION
  };
}

function renderMemorySummary(summary: any) {
  return `# SKS Memory Summary

- Schema: ${summary.schema}
- Generated: ${summary.generated_at}
- TriWiki summary schema: ${summary.summaries.triwiki.schema_version}
- Wrongness summary schema: ${summary.summaries.wrongness.schema_version}
- Shared memory summary schema: ${summary.summaries.shared_memory.schema_version}
- Rebuild recommended: ${summary.summaries.triwiki.rebuild_recommended || summary.summaries.shared_memory.rebuild_recommended ? 'yes' : 'no'}
`;
}
