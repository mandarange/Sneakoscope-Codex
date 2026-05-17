import path from 'node:path';
import fsp from 'node:fs/promises';
import { appendJsonlBounded, ensureDir, exists, formatBytes, nowIso, PACKAGE_VERSION, readJson, sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { contextCapsule } from '../triwiki-attention.mjs';
import { rgbaKey, rgbaToWikiCoord, validateWikiCoordinateIndex } from '../wiki-coordinate.mjs';
import { pruneWikiArtifacts } from '../retention.mjs';
import { stackCurrentDocsPolicy } from '../routes.mjs';
import { writeMemorySweepReport } from '../memory-governor.mjs';
import { writeSkillForgeReport } from '../skill-forge.mjs';
import { writeMistakeMemoryReport } from '../mistake-memory.mjs';
import { writeCodeStructureReport } from '../code-structure.mjs';
import { missionDir, createMission } from '../mission.mjs';
import { addImageRelation, addVisualAnchor, ingestImage, imageVoxelSummary, readImageVoxelLedger } from '../wiki-image/image-voxel-ledger.mjs';
import { imageVoxelProofEvidence } from '../wiki-image/proof-linker.mjs';
import { validateImageVoxelLedger } from '../wiki-image/validation.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { flag, positionalArgs, readFlagValue, readOption, resolveMissionId } from './command-utils.mjs';

export async function wikiCommand(sub, args = []) {
  if (!sub || sub === 'help' || sub === '--help') {
    console.log('Usage: sks wiki coords --rgba R,G,B,A | sks wiki pack|refresh|sweep|prune|validate | sks wiki image-ingest|anchor-add|relation-add|image-validate|image-summary');
    return;
  }
  if (sub === 'image-ingest') return wikiImageIngest(args);
  if (sub === 'image-validate') return wikiImageValidate(args);
  if (sub === 'image-summary') return wikiImageSummary(args);
  if (sub === 'anchor-add') return wikiAnchorAdd(args);
  if (sub === 'relation-add') return wikiRelationAdd(args);
  if (sub === 'image-link-proof') return wikiImageLinkProof(args);
  if (sub === 'coords') {
    const raw = readFlagValue(args, '--rgba', positionalArgs(args)[0] || '');
    const parts = String(raw).split(/[,\s]+/).filter(Boolean).map((x) => Number.parseInt(x, 10));
    if (parts.length < 3) throw new Error('Usage: sks wiki coords --rgba R,G,B,A');
    const coord = rgbaToWikiCoord({ r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 255 });
    console.log(JSON.stringify({ rgba: coord.rgba, rgba_key: rgbaKey(coord.rgba), coord }, null, 2));
    return;
  }
  if (sub === 'pack') {
    const root = await sksRoot();
    const { pack, file } = await writeWikiContextPack(root, args);
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...pack, path: file }, null, 2));
    printWikiPackSummary(root, file, pack);
    return;
  }
  if (sub === 'refresh') {
    const root = await sksRoot();
    const dryRun = flag(args, '--dry-run');
    const { pack, file } = await writeWikiContextPack(root, args, { dryRun });
    const validation = wikiValidationResult(pack);
    const exitCode = validation.result.ok ? 0 : 2;
    const pruneRequested = flag(args, '--prune');
    const pruneResult = pruneRequested ? await pruneWikiArtifacts(root, { dryRun }) : null;
    if (!dryRun) {
      const { id, dir } = await createMission(root, { mode: 'wiki', prompt: 'sks wiki refresh' });
      const gate = { schema_version: 1, passed: validation.result.ok, ok: validation.result.ok, context_pack: '.sneakoscope/wiki/context-pack.json', anchors: wikiAnchorCount(pack.wiki), voxels: wikiVoxelRowCount(pack.wiki) };
      await writeJsonAtomic(path.join(dir, 'wiki-gate.json'), gate);
      await maybeFinalizeRoute(root, { missionId: id, route: '$Wiki', gateFile: 'wiki-gate.json', gate, artifacts: ['wiki-gate.json', 'completion-proof.json'], statusHint: validation.result.ok ? 'verified_partial' : 'blocked', blockers: validation.result.ok ? [] : validation.result.issues, command: { cmd: 'sks wiki refresh', status: exitCode } });
    }
    if (flag(args, '--json')) {
      process.exitCode = exitCode;
      return console.log(JSON.stringify({
        path: file,
        dryRun,
        written: !dryRun,
        claims: pack.claims.length,
        anchors: wikiAnchorCount(pack.wiki),
        attention: wikiAttentionSummary(pack),
        trust_summary: pack.trust_summary,
        validation,
        ...(pruneResult ? { prune: { dryRun: pruneResult.dryRun, scanned: pruneResult.scanned, candidates: pruneResult.candidates, actions: pruneResult.actions } } : {})
      }, null, 2));
    }
    console.log('Sneakoscope LLM Wiki Refresh');
    if (dryRun) console.log('Dry run: context pack was built and validated in memory; no wiki file was written.');
    printWikiPackSummary(root, file, pack);
    console.log(`Validation: ${validation.result.ok ? 'ok' : 'failed'} (${validation.result.checked} anchors, ${validation.trustAnchors} trust anchors)`);
    if (pruneResult) {
      console.log(`${pruneResult.dryRun ? 'Prune dry run' : 'Prune'}: ${pruneResult.candidates} wiki artifact(s), ${pruneResult.scanned} scanned`);
      for (const a of pruneResult.actions.slice(0, 20)) console.log(`- ${a.reason} ${path.relative(root, a.path)} ${a.bytes ? formatBytes(a.bytes) : ''}`.trim());
    } else {
      console.log('Prune: skipped (pass --prune to prune stale/low-trust wiki artifacts)');
    }
    process.exitCode = exitCode;
    return;
  }
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
    console.log(`Forget queue: ${report.operations.filter((op) => ['DEMOTE', 'SOFT_FORGET', 'ARCHIVE', 'HARD_DELETE', 'CONSOLIDATE'].includes(op.operation)).length}`);
    console.log(`Budget: ${report.retrieval_budget.actual_tokens}/${report.retrieval_budget.max_tokens} tokens`);
    return;
  }
  if (sub === 'validate') {
    const root = await sksRoot();
    const target = positionalArgs(args)[0] || path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
    const pack = await readJson(path.resolve(target));
    const { result, trustAnchors } = wikiValidationResult(pack);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Wiki coordinate index: ${result.ok ? 'ok' : 'failed'}`);
    console.log(`Anchors checked: ${result.checked}`);
    console.log(`Trust anchors: ${trustAnchors}/${result.checked}`);
    for (const issue of result.issues) console.log(`- ${issue.severity}: ${issue.id}${issue.anchor ? ` ${issue.anchor}` : ''}`);
    process.exitCode = result.ok ? 0 : 2;
    return;
  }
  console.error('Usage: sks wiki coords|pack|refresh|sweep|prune|validate|image-ingest|anchor-add|relation-add|image-validate|image-summary');
  process.exitCode = 1;
}

async function wikiImageIngest(args = []) {
  const root = await sksRoot();
  const imagePath = args.find((arg, i) => i >= 0 && !String(arg).startsWith('--'));
  const { id, dir } = await createMission(root, { mode: 'wiki', prompt: `sks wiki image-ingest ${imagePath || ''}`.trim() });
  const result = await ingestImage(root, imagePath, { source: readOption(args, '--source', 'manual'), missionId: readOption(args, '--mission-id', id) || id });
  const gate = { schema_version: 1, passed: result.ok, ok: result.ok, image_id: result.image.id, image_voxel_ledger: 'image-voxel-ledger.json' };
  await writeJsonAtomic(path.join(dir, 'wiki-image-gate.json'), gate);
  const fixtureMode = flag(args, '--mock') || String(imagePath || '').includes('test/fixtures/images/');
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$Wiki', gateFile: 'wiki-image-gate.json', gate, visual: true, mock: fixtureMode, artifacts: ['image-voxel-ledger.json', 'visual-anchors.json', 'completion-proof.json'], statusHint: result.ok ? 'verified_partial' : 'blocked', command: { cmd: `sks wiki image-ingest ${imagePath}`, status: result.ok ? 0 : 1 } });
  const output = { ...result, mission_id: id, completion_proof: { ok: proof.ok, validation: proof.validation } };
  if (flag(args, '--json')) return console.log(JSON.stringify(output, null, 2));
  console.log(`Image ingested: ${result.image.id}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageValidate(args = []) {
  const root = await sksRoot();
  const ledgerPath = args.find((arg, i) => i >= 0 && !String(arg).startsWith('--'));
  const ledger = await readImageVoxelLedger(root, ledgerPath ? path.resolve(root, ledgerPath) : undefined);
  const result = { schema: 'sks.image-voxel-validation.v1', ...validateImageVoxelLedger(ledger, { requireAnchors: flag(args, '--require-anchors'), requireRelations: flag(args, '--require-relations'), route: readOption(args, '--route', '$Wiki') }) };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Image voxel ledger: ${result.ok ? 'pass' : 'blocked'}`);
  for (const issue of result.issues) console.log(`- ${issue}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageSummary(args = []) {
  const root = await sksRoot();
  const result = await imageVoxelSummary(root);
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Images: ${result.images}`);
  console.log(`Anchors: ${result.anchors}`);
  console.log(`Relations: ${result.relations}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiAnchorAdd(args = []) {
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

async function wikiRelationAdd(args = []) {
  const root = await sksRoot();
  const result = await addImageRelation(root, {
    type: readOption(args, '--type', 'before_after'),
    beforeImageId: readOption(args, '--before', null),
    afterImageId: readOption(args, '--after', null),
    anchors: String(readOption(args, '--anchors', '') || '').split(',').map((x) => x.trim()).filter(Boolean),
    verification: readOption(args, '--verification', 'changed-screen-recheck'),
    status: readOption(args, '--status', 'verified_partial'),
    route: readOption(args, '--route', '$Wiki'),
    missionId: readOption(args, '--mission-id', null)
  });
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Image relation: ${result.ok ? 'added' : 'blocked'} ${result.relation.type}`);
  if (!result.ok) process.exitCode = 1;
}

async function wikiImageLinkProof(args = []) {
  const root = await sksRoot();
  const result = await imageVoxelProofEvidence(root);
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Image voxel proof link: ${result.ok ? 'ok' : 'blocked'}`);
  if (!result.ok) process.exitCode = 1;
}

export async function writeWikiContextPack(root, args = [], opts = {}) {
  const role = readFlagValue(args, '--role', 'worker');
  const maxAnchors = Number(readFlagValue(args, '--max-anchors', role.includes('verifier') ? 48 : 32));
  const pack = contextCapsule({
    mission: { id: 'project-wiki', coord: { rgba: { r: 48, g: 132, b: 212, a: 240 } } },
    role,
    contractHash: null,
    claims: await projectWikiClaims(root),
    q4: { mode: 'project-continuity', package: PACKAGE_VERSION, hydrate: 'anchor-first' },
    q3: ['sks', 'llm-wiki', 'wiki-coordinate', 'gx', 'skills'],
    budget: { maxWikiAnchors: maxAnchors, includeTrustSummary: true }
  });
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  if (!opts.dryRun) {
    await ensureDir(path.dirname(file));
    await writeJsonAtomic(file, pack);
  }
  return { pack, file, role, maxAnchors };
}

export async function migrateWikiContextPack(root) {
  try {
    const { pack } = await writeWikiContextPack(root, ['--max-anchors', '32']);
    return wikiValidationResult(pack).result.ok;
  } catch {
    return false;
  }
}

function wikiAnchorCount(wiki = {}) {
  return (wiki.anchors || wiki.a || []).length;
}

export function wikiVoxelRowCount(wiki = {}) {
  const overlay = wiki.vx || wiki.voxel_overlay || {};
  return (overlay.rows || overlay.v || []).length;
}

function wikiValidationResult(pack = {}) {
  const wikiIndex = pack.wiki || pack;
  const result = validateWikiCoordinateIndex(wikiIndex);
  return { result, trustAnchors: countTrustAnchors(wikiIndex) };
}

function printWikiPackSummary(root, file, pack) {
  console.log('Sneakoscope LLM Wiki Context Pack');
  console.log(`Path:     ${path.relative(root, file)}`);
  console.log(`Claims:   ${pack.claims.length} hydrated text claims`);
  console.log(`Anchors:  ${wikiAnchorCount(pack.wiki)} coordinate anchors (${pack.wiki.overflow_count ?? pack.wiki.o ?? 0} overflow)`);
  console.log(`Voxels:   ${wikiVoxelRowCount(pack.wiki)} metadata rows (${pack.wiki.vx?.s || pack.wiki.vx?.schema || 'none'})`);
  if (pack.attention) console.log(`Attention: use_first=${pack.attention.use_first?.length || 0} hydrate_first=${pack.attention.hydrate_first?.length || 0} (${pack.attention.mode})`);
  console.log(`Schema:   ${pack.wiki.schema}`);
  console.log(`Trust:    avg=${pack.trust_summary.avg} needs_evidence=${pack.trust_summary.needs_evidence}`);
  console.log('Guidance: follow high-trust claims; hydrate source/evidence before relying on lower-trust claims. Stack/version changes require current Context7 or official-doc TriWiki claims before coding.');
  console.log(`Validate: sks wiki validate ${path.relative(root, file)}`);
}

function wikiAttentionSummary(pack = {}) {
  const attention = pack.attention || {};
  return {
    mode: attention.mode || null,
    use_first: Array.isArray(attention.use_first) ? attention.use_first.length : 0,
    hydrate_first: Array.isArray(attention.hydrate_first) ? attention.hydrate_first.length : 0,
    fields: { use_first: ['id', 'rgba', 'h'], hydrate_first: ['id', 'reason'] }
  };
}

function countTrustAnchors(wiki = {}) {
  const rows = Array.isArray(wiki.a) ? wiki.a : (Array.isArray(wiki.anchors) ? wiki.anchors.map((anchor) => [anchor.id, null, null, null, null, null, null, null, null, anchor.trust_score, anchor.trust_band]) : []);
  return rows.filter((row) => row?.[9] != null && row?.[10]).length;
}

export async function projectWikiClaims(root) {
  const claims = [
    ['wiki-hooks', '.codex/hooks.json routes UserPromptSubmit, tool, permission, and Stop events through SKS guards.', '.codex/hooks.json', 'code', 'high'],
    ['wiki-config', '.codex/config.toml enables Codex App profiles, multi-agent support, and Team agent limits.', '.codex/config.toml', 'code', 'high'],
    ['wiki-skills', '.agents/skills provides official repo-local routes plus support skills for dfix, team, goal, research, autoresearch, db, gx, wiki, reflection, evaluation, design-system/UI editing, and imagegen workflows.', '.agents/skills', 'code', 'medium'],
    ['wiki-agents', '.codex/agents defines Team analysis scout, planning, implementation, DB safety, and QA reviewer roles.', '.codex/agents', 'code', 'medium'],
    ['wiki-policy', '.sneakoscope/policy.json stores update-check, honest-mode, retention, database, performance, and prompt-pipeline policy.', '.sneakoscope/policy.json', 'contract', 'high'],
    ['wiki-memory', '.sneakoscope/memory stores Q0 raw, Q1 evidence, Q2 facts, Q3 tags, and Q4 control bits for hydratable context.', '.sneakoscope/memory', 'wiki', 'high'],
    ['wiki-gx', 'GX cartridges keep vgraph.json and beta.json as deterministic visual context sources with render, validation, drift, and snapshot outputs.', '.sneakoscope/gx/cartridges', 'vgraph', 'medium'],
    ['wiki-db', 'Database safety blocks destructive SQL, risky Supabase commands, unsafe MCP writes, and production data mutation.', '.sneakoscope/db-safety.json', 'code', 'critical'],
    ['wiki-hproof', 'H-Proof blocks completion when unsupported critical claims, DB safety issues, missing tests, or high visual/wiki drift remain.', '.sneakoscope/hproof', 'test', 'critical'],
    ['wiki-eval', 'sks eval run measures token savings, evidence-weighted accuracy proxy, required recall, unsupported critical filtering, and build runtime.', 'src/core/evaluation.mjs', 'test', 'medium'],
    ['wiki-trig', 'TriWiki maps RGBA channels to domain angle, layer radius, phase, and concentration using deterministic trigonometric coordinates.', 'src/core/wiki-coordinate.mjs', 'code', 'high']
  ];
  const out = [];
  for (const [id, text, file, authority, risk] of claims) {
    out.push({ id, text, authority, risk, status: await exists(path.join(root, file)) ? 'supported' : 'unknown', freshness: 'fresh', source: file, file, evidence_count: await exists(path.join(root, file)) ? 1 : 0 });
  }
  const stackPolicy = stackCurrentDocsPolicy();
  out.push({
    id: 'wiki-stack-current-docs-policy',
    text: `When project tech stack, framework, package, runtime, SDK, MCP, or deployment-platform versions change, use Context7 or official vendor docs, write current syntax/security/limit guidance to ${stackPolicy.memory_path}, refresh TriWiki, validate it, and prefer those claims over stale model defaults before coding.`,
    authority: 'contract',
    risk: 'critical',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/routes.mjs',
    file: 'src/core/routes.mjs',
    evidence_count: 3,
    required_weight: 1.35,
    trust_score: 0.95
  });
  out.push({
    id: 'wiki-aggressive-active-recall',
    text: 'TriWiki should be used aggressively for performance and accuracy: route prompts and worker handoffs should consume attention.use_first for compact high-trust recall and attention.hydrate_first for source hydration of risky or lower-trust claims before decisions.',
    authority: 'code',
    risk: 'high',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/triwiki-attention.mjs',
    file: 'src/core/triwiki-attention.mjs',
    evidence_count: 3,
    required_weight: 1.45,
    trust_score: 0.95
  });
  out.push(...(await memoryWikiClaims(root)));
  out.push(...(await userRequestSignalWikiClaims(root)));
  return out;
}

async function memoryWikiClaims(root) {
  const base = path.join(root, '.sneakoscope', 'memory');
  const files = await listMemoryClaimFiles(base);
  const claims = [];
  for (const file of files.slice(0, 80)) {
    let text = '';
    try { text = await fsp.readFile(file, 'utf8'); } catch { continue; }
    const relFile = path.relative(root, file);
    if (!text.trim()) continue;
    for (const row of selectMemoryClaimRows(parseMemoryClaimRows(text, relFile), 48)) {
      const source = row.source || relFile;
      const sourceExists = source && (await exists(path.join(root, source)));
      claims.push({
        id: row.id || `memory-${slugifyClaimId(relFile)}-${claims.length + 1}`,
        text: row.text,
        source,
        file: source,
        authority: row.authority || 'wiki',
        risk: row.risk || 'high',
        status: row.status || (sourceExists || source === relFile ? 'supported' : 'unknown'),
        freshness: row.freshness || 'fresh',
        evidence_count: row.evidence_count ?? (sourceExists ? 2 : 1),
        required_weight: row.required_weight ?? 0.85,
        trust_score: row.trust_score
      });
    }
  }
  return claims;
}

function selectMemoryClaimRows(rows = [], limit = 48) {
  return rows.slice(-limit);
}

async function listMemoryClaimFiles(base) {
  const out = [];
  async function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p, depth + 1);
      else if (/\.(md|txt|json)$/i.test(entry.name)) out.push(p);
    }
  }
  await walk(base);
  return out;
}

function parseMemoryClaimRows(text, relFile) {
  if (/\.json$/i.test(relFile)) {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.claims) ? parsed.claims : []);
      return rows.map((row) => normalizeMemoryClaimRow(row, relFile)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => normalizeMemoryClaimRow(line.replace(/^[-*]\s*/, ''), relFile)).filter(Boolean);
}

function normalizeMemoryClaimRow(row, relFile) {
  if (!row) return null;
  if (typeof row === 'object') {
    const text = String(row.text || row.claim || '').trim();
    if (!text) return null;
    return { id: row.id ? String(row.id) : null, text: text.slice(0, 320), source: row.source || row.file || relFile, authority: row.authority, risk: row.risk, status: row.status || row.confidence, freshness: row.freshness, evidence_count: parseOptionalNumber(row.evidence_count), required_weight: parseOptionalNumber(row.required_weight), trust_score: parseOptionalNumber(row.trust_score) };
  }
  const clean = String(row || '').trim();
  if (!/\bclaim\s*:/i.test(clean)) return null;
  return { id: extractClaimField(clean, 'id'), text: clean.slice(0, 320), source: extractClaimField(clean, 'source') || extractClaimField(clean, 'file') || relFile, authority: extractClaimField(clean, 'authority') || 'wiki', risk: extractClaimField(clean, 'risk') || 'high', status: extractClaimField(clean, 'status'), freshness: extractClaimField(clean, 'freshness') || 'fresh', evidence_count: parseOptionalNumber(extractClaimField(clean, 'evidence_count')), required_weight: parseOptionalNumber(extractClaimField(clean, 'required_weight')), trust_score: parseOptionalNumber(extractClaimField(clean, 'trust_score')) };
}

function extractClaimField(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`\\b${escaped}\\s*[:=]\\s*\`?([^\`|,;]+)`, 'i'));
  return match ? match[1].trim().replace(/[.;)]$/, '') : null;
}

function parseOptionalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function slugifyClaimId(value) {
  return String(value || 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'claim';
}

async function userRequestSignalWikiClaims(root) {
  const base = path.join(root, '.sneakoscope', 'missions');
  let entries = [];
  try { entries = await fsp.readdir(base, { withFileTypes: true }); } catch { return []; }
  const topics = new Map();
  for (const id of entries.filter((item) => item.isDirectory() && item.name.startsWith('M-')).map((item) => item.name).sort().reverse().slice(0, 120)) {
    const mission = await readJson(path.join(base, id, 'mission.json'), null);
    const prompt = String(mission?.prompt || '').trim();
    if (!prompt) continue;
    for (const topic of userRequestSignal(prompt).topics) {
      const current = topics.get(topic) || { count: 0, examples: [] };
      current.count += 1;
      if (current.examples.length < 3) current.examples.push(id);
      topics.set(topic, current);
    }
  }
  return [...topics.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 16).map(([topic, row]) => ({
    id: `user-request-frequency-${slugifyClaimId(topic)}`,
    text: `User request topic "${topic}" appeared ${row.count} time(s); repeated topics should be consulted before asking predictable clarification questions.`,
    authority: 'wiki',
    risk: 'medium',
    status: 'supported',
    freshness: 'fresh',
    source: '.sneakoscope/missions',
    file: '.sneakoscope/missions',
    evidence_count: row.count,
    required_weight: Math.min(1.25, 0.45 + row.count * 0.12)
  }));
}

function userRequestSignal(prompt = '') {
  const lower = String(prompt || '').toLowerCase();
  const topicRules = [
    ['ambiguity-questions', /모호|ambiguity|clarification|질문|답변|answers?\.json|decision-contract|추론|예측/],
    ['triwiki-priority-memory', /triwiki|wiki|메모리|memory|기억|우선|반복|자주|카운팅|count|frequency|weight/],
    ['install-bootstrap', /bootstrap|postinstall|doctor|deps|tmux|최초\s*설치|셋업|setup/],
    ['version-release', /버전|version|publish:dry|release|npm\s+pack/],
    ['qa-loop', /qa|e2e|검증|리포트|report/],
    ['team-pipeline', /team|subagent|세션|cleanup|reflection|회고|반성/],
    ['safety-boundary', /삭제|파괴|destructive|production|권한|보안|인증|결제/]
  ];
  const topics = topicRules.filter(([, pattern]) => pattern.test(lower)).map(([topic]) => topic);
  if (!topics.length) topics.push('general-user-preference');
  return { topics };
}

function parseBbox(raw) {
  const parts = String(raw || '').split(',').map((part) => Number(part.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}
