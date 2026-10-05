import path from 'node:path';
import { exists, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { rgbaKey, rgbaToWikiCoord, validateWikiCoordinateIndex } from '../wiki-coordinate.js';
import { pruneWikiArtifacts } from '../retention.js';
import { writeMemorySweepReport } from '../memory-governor.js';
import { writeSkillForgeReport } from '../skill-forge.js';
import { writeMistakeMemoryReport } from '../mistake-memory.js';
import { writeCodeStructureReport } from '../code-structure.js';
import { rebuildMemorySummaries } from '../memory-summary.js';
import { missionDir, createMission } from '../mission.js';
import { addImageRelation, addVisualAnchor, ingestImage, imageVoxelSummary, readImageVoxelLedger } from '../wiki-image/image-voxel-ledger.js';
import { imageVoxelProofEvidence } from '../wiki-image/proof-linker.js';
import { validateImageVoxelLedger } from '../wiki-image/validation.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { wikiWrongnessCommand } from '../triwiki-wrongness/wrongness-cli.js';
import { recordImageWrongnessFromValidation } from '../triwiki-wrongness/image-wrongness.js';
import { publishSharedMemory, rebuildSharedIndexes, sharedMemorySummary, validateSharedMemory } from '../git-hygiene/shared-memory-publish.js';
import {
  codePackPath,
  isCodePackProjectionBoundToSnapshot,
  type CodePack
} from '../triwiki/code-pack.js';
import { runContextGraphLint } from '../triwiki/context-graph/lint/index.js';
import { contextIndexFreshness } from '../triwiki/context-graph/store/index-freshness.js';
import { readContextGraphMeta, readContextGraphSnapshot } from '../triwiki/context-graph/store/snapshot-store.js';
import { alignGraphExtractors } from '../triwiki/context-graph/extractors/index.js';
import { CONTEXT_GRAPH_REPAIR_COMMAND } from '../triwiki/context-graph/contracts.js';
import { inspectCodePackHeadFreshness } from '../triwiki/code-pack-head-freshness.js';
import { validateTriWikiContextPackProvenance } from '../triwiki-provenance.js';
import { flag, positionalArgs, readFlagValue, readOption, resolveMissionId } from './command-utils.js';

export async function wikiCommand(sub: any, args: any = []) {
  if (!sub || sub === 'help' || sub === '--help') {
    console.log('Usage: sks wiki validate|prune|coords --rgba R,G,B,A|publish|rebuild-index|rebuild-summary|validate-shared|wrongness | sks wiki image-ingest|anchor-add|relation-add|image-validate|image-summary\n`sks wiki refresh` and `sks wiki pack` run `sks align run`, the one TriWiki writer.');
    return;
  }
  if (sub === 'image-ingest') return wikiImageIngest(args);
  if (sub === 'image-validate') return wikiImageValidate(args);
  if (sub === 'image-summary') return wikiImageSummary(args);
  if (sub === 'wrongness') return wikiWrongnessCommand(args);
  if (sub === 'anchor-add') return wikiAnchorAdd(args);
  if (sub === 'relation-add') return wikiRelationAdd(args);
  if (sub === 'image-link-proof') return wikiImageLinkProof(args);
  if (sub === 'coords') {
    const raw = readFlagValue(args, '--rgba', positionalArgs(args)[0] || '');
    const parts = String(raw).split(/[,\s]+/).filter(Boolean).map((x: any) => Number.parseInt(x, 10));
    if (parts.length < 3) throw new Error('Usage: sks wiki coords --rgba R,G,B,A');
    const coord = rgbaToWikiCoord({ r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 255 });
    console.log(JSON.stringify({ rgba: coord.rgba, rgba_key: rgbaKey(coord.rgba), coord }, null, 2));
    return;
  }
  if (sub === 'pack') return wikiRefreshViaAlign(args);
  if (sub === 'publish') {
    const root = await sksRoot();
    if (!flag(args, '--shared')) throw new Error('Usage: sks wiki publish latest --shared [--redact] [--json]');
    const target = positionalArgs(args)[0] || 'latest';
    if (target !== 'latest') throw new Error('Usage: sks wiki publish latest --shared [--redact] [--json]');
    const result = await publishSharedMemory(root, { target: 'wiki', redact: flag(args, '--redact') });
    process.exitCode = result.ok ? 0 : 2;
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Shared wiki publish: ${result.ok ? 'ok' : 'blocked'}`);
    console.log(`Written: ${result.written.length}`);
    for (const blocker of result.blockers) console.log(`- ${blocker}`);
    return;
  }
  if (sub === 'rebuild-index') {
    const root = await sksRoot();
    const result = await rebuildSharedIndexes(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Shared wiki indexes rebuilt: ${result.indexes.join(', ')}`);
    return;
  }
  if (sub === 'validate-shared') {
    const root = await sksRoot();
    const result = await validateSharedMemory(root);
    process.exitCode = result.ok ? 0 : 2;
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Shared wiki validation: ${result.ok ? 'ok' : 'failed'} (${result.checked} checked)`);
    for (const issue of result.issues) console.log(`- ${issue}`);
    return;
  }
  if (sub === 'shared-summary') {
    const root = await sksRoot();
    const result = await sharedMemorySummary(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Shared wiki summary: ${result.ok ? 'ok' : 'blocked'} (${result.files} files)`);
    return;
  }
  if (sub === 'rebuild-summary') {
    const root = await sksRoot();
    const result = await rebuildMemorySummaries(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Memory summary rebuilt: ${result.ok ? 'ok' : 'blocked'}`);
    return;
  }
  if (sub === 'refresh') return wikiRefreshViaAlign(args);
  if (sub === 'prune') {
    const root = await sksRoot();
    const pruneResult = await pruneWikiArtifacts(root, { dryRun: flag(args, '--dry-run') });
    if (flag(args, '--json')) return console.log(JSON.stringify({ dryRun: pruneResult.dryRun, scanned: pruneResult.scanned, candidates: pruneResult.candidates, actions: pruneResult.actions }, null, 2));
    console.log('Sneakoscope LLM Wiki Prune');
    console.log(`${pruneResult.dryRun ? 'Dry run' : 'Pruned'}: ${pruneResult.candidates} wiki artifact(s), ${pruneResult.scanned} scanned`);
    return;
  }
  if (sub === 'sweep') {
    const root = await sksRoot();
    const id = await resolveMissionId(root, positionalArgs(args)[0]);
    const dir = id ? missionDir(root, id) : path.join(root, '.sneakoscope', 'reports');
    const report = await writeMemorySweepReport(root, dir, { missionId: id || 'project-wiki' });
    if (id) {
      await writeSkillForgeReport(dir, { mission_id: id, route: 'wiki', task_signature: 'memory sweep' });
      await writeMistakeMemoryReport(dir, { mission_id: id, route: 'wiki', task: 'memory sweep' });
      await writeCodeStructureReport(root, dir, { missionId: id, exception: 'Generated by wiki sweep; split decisions are reported, not applied automatically.' });
    }
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('Sneakoscope TriWiki Sweep');
    console.log(`Operations: ${report.operations.length}`);
    console.log(`Forget queue: ${report.operations.filter((op: any) => ['DEMOTE', 'SOFT_FORGET', 'ARCHIVE', 'HARD_DELETE', 'CONSOLIDATE'].includes(op.operation)).length}`);
    console.log(`Budget: ${report.retrieval_budget.actual_tokens}/${report.retrieval_budget.max_tokens} tokens`);
    return;
  }
  if (sub === 'validate') {
    const root = await sksRoot();
    const target = positionalArgs(args)[0] || path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
    const pack = await readJson(path.resolve(target));
    const { result, trustAnchors } = wikiValidationResult(pack, root);
    const codePack = await codePackFreshness(root);
    const graph = await wikiValidateContextGraph(root);
    const ok = result.ok && graph.ok;
    process.exitCode = ok ? 0 : 2;
    if (flag(args, '--json')) {
      return console.log(JSON.stringify({ ...result, ok, code_pack: codePack, context_graph: graph }, null, 2));
    }
    console.log(`Wiki coordinate index: ${result.ok ? 'ok' : 'failed'}`);
    console.log(`Anchors checked: ${result.checked}`);
    console.log(`Trust anchors: ${trustAnchors}/${result.checked}`);
    for (const issue of result.issues) console.log(`- ${issue.severity}: ${issue.id}${issue.anchor ? ` ${issue.anchor}` : ''}`);
    console.log(`Code pack: ${codePack.status}${codePack.status === 'stale' ? ` — run \`${CONTEXT_GRAPH_REPAIR_COMMAND}\`` : ''}`);
    console.log(`Context graph: ${graph.status}${graph.ok ? '' : ` — run \`${CONTEXT_GRAPH_REPAIR_COMMAND}\``}`);
    for (const issue of graph.issues) console.log(`- ${issue}`);
    return;
  }
  console.error('Usage: sks wiki coords|pack|refresh|publish|rebuild-index|rebuild-summary|validate|validate-shared|wrongness|image-ingest|anchor-add|relation-add|image-validate|image-summary');
  process.exitCode = 1;
}

/**
 * Graph half of `sks wiki validate`: schema and lint, snapshot/meta parity,
 * source-hash freshness, and projection parity between the snapshot and the
 * code pack that was projected from it. A stale or missing graph is reported,
 * never repaired here — repair belongs to `sks align run`.
 */
async function wikiValidateContextGraph(root: string): Promise<{ ok: boolean; status: string; snapshot_hash: string | null; issues: string[] }> {
  const status = await contextIndexFreshness(root, { extractors: alignGraphExtractors() });
  if (status.status !== 'fresh') {
    return {
      ok: false,
      status: status.status,
      snapshot_hash: status.snapshotHash,
      issues: [status.errorCode ?? 'context_graph_not_fresh', ...status.reasons]
    };
  }
  const snapshotLoad = await readContextGraphSnapshot(root);
  const metaLoad = await readContextGraphMeta(root);
  if (snapshotLoad.status !== 'ok' || !snapshotLoad.snapshot || metaLoad.status !== 'ok' || !metaLoad.meta) {
    return { ok: false, status: 'corrupt', snapshot_hash: status.snapshotHash, issues: ['context_graph_snapshot_meta_unreadable'] };
  }
  const lint = runContextGraphLint({ root, snapshot: snapshotLoad.snapshot, meta: metaLoad.meta });
  const issues = lint.errors.slice(0, 20).map((issue) => `${issue.code}: ${issue.message}`);
  // Projection parity: a code pack that does not name the snapshot it came from
  // is a pack from some other graph generation.
  const pack = await readJson<CodePack | null>(codePackPath(root), null).catch(() => null);
  const digest = typeof pack?.index_digest === 'string' ? pack.index_digest : '';
  const boundToSnapshot = Boolean(
    pack
    && Array.isArray(pack.entries)
    && isCodePackProjectionBoundToSnapshot(snapshotLoad.snapshot.snapshotHash, pack)
  );
  if (digest && !boundToSnapshot) issues.push('code_pack_not_bound_to_current_snapshot');
  return {
    ok: lint.ok && (!digest || boundToSnapshot),
    status: 'fresh',
    snapshot_hash: snapshotLoad.snapshot.snapshotHash,
    issues
  };
}

/**
 * S3 / NC-21: `sks align run` is the one writer of the TriWiki index, the code
 * pack, the context pack, and the AGENTS.md projections. `wiki refresh` and
 * `wiki pack` used to build a second context pack (memory claims plus code
 * entries) into the same file, so whichever ran last silently replaced the
 * other. Both are now this alias; `--prune` still runs wiki retention after
 * the rebuild, and `--dry-run` only validates the current pack.
 */
async function wikiRefreshViaAlign(args: any = []): Promise<void> {
  const json = flag(args, '--json');
  if (flag(args, '--dry-run')) {
    const note = 'wiki refresh --dry-run: nothing is rebuilt; validating the current context pack (`sks align run` rebuilds it).';
    if (json) process.stderr.write(`${note}\n`); else console.log(note);
    await wikiCommand('validate', json ? ['--json'] : []);
    return;
  }
  if (json) process.stderr.write('wiki refresh/pack: aliasing to sks align run (the single TriWiki writer)\n');
  else console.log('sks wiki refresh/pack → sks align run (the single TriWiki writer)');
  const { alignCommand } = await import('./align-command.js');
  await alignCommand('run', (Array.isArray(args) ? args : []).filter((arg: any) => arg !== '--code' && arg !== '--prune'));
  if (flag(args, '--prune') && !process.exitCode) {
    const root = await sksRoot();
    const pruneResult = await pruneWikiArtifacts(root, { dryRun: false });
    if (!json) console.log(`Prune: ${pruneResult.candidates} wiki artifact(s), ${pruneResult.scanned} scanned`);
  }
}

async function codePackFreshness(root: any): Promise<{ status: 'fresh' | 'stale' | 'missing'; git_head_sha: string | null; pack_sha: string | null }> {
  const packPath = path.join(root, '.sneakoscope', 'wiki', 'code-pack.json');
  if (!(await exists(packPath))) return { status: 'missing', git_head_sha: null, pack_sha: null };
  const pack = await readJson<any>(packPath, null).catch(() => null);
  const packSha = pack?.git_head_sha || null;
  if (!packSha) return { status: 'missing', git_head_sha: null, pack_sha: null };
  const freshness = await inspectCodePackHeadFreshness(root, packSha, { timeoutMs: 5_000 });
  return {
    status: freshness.fresh ? 'fresh' : 'stale',
    git_head_sha: freshness.current_sha,
    pack_sha: freshness.pack_sha
  };
}

async function wikiImageIngest(args: any = []) {
  const root = await sksRoot();
  const imagePath = args.find((arg: any, i: any) => i >= 0 && !String(arg).startsWith('--'));
  const { id, dir } = await createMission(root, { mode: 'wiki', prompt: `sks wiki image-ingest ${imagePath || ''}`.trim() });
  const result = await ingestImage(root, imagePath, { source: readOption(args, '--source', 'manual'), missionId: readOption(args, '--mission-id', id) || id });
  const gateBlockers = wikiGateBlockers(result.ok, result.validation?.issues, 'wiki_image_ingest_validation_failed');
  const gate = { schema_version: 1, passed: result.ok, ok: result.ok, blockers: gateBlockers, image_id: result.image.id, image_voxel_ledger: 'image-voxel-ledger.json' };
  await writeJsonAtomic(path.join(dir, 'wiki-image-gate.json'), gate);
  const fixtureMode = flag(args, '--mock') || String(imagePath || '').includes('test/fixtures/images/');
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$Wiki', gateFile: 'wiki-image-gate.json', gate, visual: true, mock: fixtureMode, artifacts: ['image-voxel-ledger.json', 'visual-anchors.json', 'completion-proof.json'], statusHint: result.ok ? 'verified_partial' : 'blocked', blockers: gateBlockers, command: { cmd: `sks wiki image-ingest ${imagePath}`, status: result.ok ? 0 : 1 } });
  const output = { ...result, mission_id: id, completion_proof: { ok: proof.ok, validation: proof.validation } };
  if (flag(args, '--json')) return console.log(JSON.stringify(output, null, 2));
  console.log(`Image ingested: ${result.image.id}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageValidate(args: any = []) {
  const root = await sksRoot();
  const ledgerPath = args.find((arg: any, i: any) => i >= 0 && !String(arg).startsWith('--'));
  const ledger = await readImageVoxelLedger(root, ledgerPath ? path.resolve(root, ledgerPath) : undefined);
  const result = { schema: 'sks.image-voxel-validation.v1', ...validateImageVoxelLedger(ledger, { requireAnchors: flag(args, '--require-anchors'), requireRelations: flag(args, '--require-relations'), route: readOption(args, '--route', '$Wiki') }) };
  const wrongness = await recordImageWrongnessFromValidation(root, {
    ledger,
    validation: result,
    missionId: readOption(args, '--mission-id', ledger.mission_id || null),
    route: readOption(args, '--route', '$Wiki'),
    artifact: ledgerPath || '.sneakoscope/wiki/image-voxel-ledger.json'
  });
  const output = { ...result, wrongness };
  if (flag(args, '--json')) return console.log(JSON.stringify(output, null, 2));
  console.log(`Image voxel ledger: ${result.ok ? 'pass' : 'blocked'}`);
  for (const issue of result.issues) console.log(`- ${issue}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageSummary(args: any = []) {
  const root = await sksRoot();
  const result = await imageVoxelSummary(root);
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Images: ${result.images}`);
  console.log(`Anchors: ${result.anchors}`);
  console.log(`Relations: ${result.relations}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiAnchorAdd(args: any = []) {
  const root = await sksRoot();
  const result = await addVisualAnchor(root, {
    imageId: readOption(args, '--image-id', null),
    bbox: parseBbox(readOption(args, '--bbox', '')),
    label: readOption(args, '--label', 'Visual anchor'),
    source: readOption(args, '--source', 'manual'),
    evidencePath: readOption(args, '--evidence', null),
    route: readOption(args, '--route', '$Wiki'),
    claimId: readOption(args, '--claim-id', null),
    missionId: readOption(args, '--mission-id', null)
  });
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Visual anchor: ${result.ok ? 'added' : 'blocked'} ${result.anchor.id}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiRelationAdd(args: any = []) {
  const root = await sksRoot();
  const result = await addImageRelation(root, {
    type: readOption(args, '--type', 'before_after'),
    beforeImageId: readOption(args, '--before', null),
    afterImageId: readOption(args, '--after', null),
    anchors: String(readOption(args, '--anchors', '') || '').split(',').map((x: any) => x.trim()).filter(Boolean),
    verification: readOption(args, '--verification', 'changed-screen-recheck'),
    status: readOption(args, '--status', 'verified_partial'),
    route: readOption(args, '--route', '$Wiki'),
    missionId: readOption(args, '--mission-id', null)
  });
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Image relation: ${result.ok ? 'added' : 'blocked'} ${result.relation.type}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageLinkProof(args: any = []) {
  const root = await sksRoot();
  const result = await imageVoxelProofEvidence(root, null);
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Image voxel proof link: ${result.ok ? 'ok' : 'blocked'}`);
  if (!result.ok) process.exitCode = 1;
}

function wikiValidationResult(pack: any = {}, root: string | null = null) {
  const wikiIndex = pack.wiki || pack;
  const coordinate = validateWikiCoordinateIndex(wikiIndex, { root, claims: pack.claims });
  const provenance = validateTriWikiContextPackProvenance(pack, { root });
  const structureIssues = [
    ...(!Array.isArray(pack.claims) ? [{ id: 'context_pack_claims_missing', severity: 'error' }] : []),
    ...(!pack.attention || !Array.isArray(pack.attention.use_first) || !Array.isArray(pack.attention.hydrate_first)
      ? [{ id: 'context_pack_attention_missing', severity: 'error' }]
      : [])
  ];
  const issues = [...coordinate.issues, ...provenance.issues, ...structureIssues];
  const result = { ok: issues.length === 0, checked: coordinate.checked, issues };
  return { result, trustAnchors: countTrustAnchors(wikiIndex) };
}

export function wikiGateBlockers(ok: any, issues: any = [], fallback = 'wiki_validation_failed') {
  if (ok === true) return [];
  const normalized = (Array.isArray(issues) ? issues : [issues])
    .map((issue: any) => {
      if (typeof issue === 'string') return issue.trim();
      if (!issue || typeof issue !== 'object') return String(issue || '').trim();
      const id = String(issue.id || issue.code || issue.message || '').trim();
      const detail = String(issue.anchor || issue.path || issue.image_id || '').trim();
      return id && detail ? `${id}:${detail}` : id;
    })
    .filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : [fallback];
}

function countTrustAnchors(wiki: any = {}) {
  const rows = Array.isArray(wiki.a) ? wiki.a : (Array.isArray(wiki.anchors) ? wiki.anchors.map((anchor: any) => [anchor.id, null, null, null, null, null, null, null, null, anchor.trust_score, anchor.trust_band]) : []);
  return rows.filter((row: any) => row?.[9] != null && row?.[10]).length;
}


function parseBbox(raw: any) {
  const parts = String(raw || '').split(',').map((part: any) => Number(part.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}
