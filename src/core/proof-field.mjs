import path from 'node:path';
import { nowIso, readText, rel, runProcess, sha256, writeJsonAtomic } from './fsx.mjs';

export const PROOF_FIELD_SCHEMA_VERSION = 1;

export const INVARIANT_LEDGER = Object.freeze([
  { id: 'db-catastrophic-guard', severity: 'critical', description: 'Database/table wipe, all-row DML, reset, and dangerous project/branch operations remain blocked.' },
  { id: 'honest-evidence', severity: 'critical', description: 'Final claims must be backed by current code, tests, artifacts, or explicitly marked unverified.' },
  { id: 'route-surface-consistency', severity: 'high', description: 'User-visible route surfaces must agree across CLI help, command catalog, generated skills, and docs.' },
  { id: 'triwiki-hydratable-context', severity: 'high', description: 'TriWiki context must remain coordinate+voxel backed and hydratable by source/hash/anchor.' },
  { id: 'no-unrequested-fallback-code', severity: 'high', description: 'Do not add substitute paths, mocks, shims, or fallback behavior unless explicitly requested.' }
]);

export const PROOF_CONE_DEFINITIONS = Object.freeze([
  {
    id: 'db_safety',
    surfaces: ['database', 'supabase', 'mad-sks'],
    match: [/db-safety|supabase|migration|rls|schema|sql/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock', 'sks db scan --json'],
    negative_work: ['browser_ui_e2e', 'visual_snapshot']
  },
  {
    id: 'route_surface',
    surfaces: ['routes', 'skills', 'cli-help', 'docs'],
    match: [/routes\.mjs|init\.mjs|codex-app|README|AGENTS|skills/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock', 'sks commands --json'],
    negative_work: ['database_migration', 'from_chat_img_forensics']
  },
  {
    id: 'cli_runtime',
    surfaces: ['cli', 'commands', 'runtime'],
    match: [/src\/cli|bin\/sks|maintenance-commands|fsx|codex-adapter/i],
    verification: ['npm run packcheck', 'node ./bin/sks.mjs commands --json', 'node ./bin/sks.mjs proof-field scan --json'],
    negative_work: ['browser_ui_e2e']
  },
  {
    id: 'context_memory',
    surfaces: ['triwiki', 'memory', 'evaluation'],
    match: [/triwiki|wiki|memory|evaluation|perf-bench|proof-field/i],
    verification: ['npm run packcheck', 'node ./bin/sks.mjs eval run --json', 'node ./bin/sks.mjs wiki validate .sneakoscope/wiki/context-pack.json'],
    negative_work: ['database_migration', 'browser_ui_e2e']
  },
  {
    id: 'release_surface',
    surfaces: ['package', 'changelog', 'release'],
    match: [/package\.json|package-lock\.json|CHANGELOG|README/i],
    verification: ['npm run release:check'],
    negative_work: []
  },
  {
    id: 'visual_forensic',
    surfaces: ['from-chat-img', 'visual', 'qa-loop'],
    match: [/from-chat-img|visual|screenshot|qa-loop|dogfood/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock'],
    negative_work: ['database_migration']
  }
]);

export async function buildProofField(root, opts = {}) {
  const changedFiles = normalizeChangedFiles(opts.changedFiles || await gitChangedFiles(root));
  const intent = String(opts.intent || '').trim();
  const selectedCones = selectProofCones(changedFiles, intent);
  const risk = riskSummary(changedFiles, selectedCones, intent);
  const negativeWork = buildNegativeWorkCache(selectedCones, risk);
  const fastLane = fastLaneDecision({ changedFiles, selectedCones, risk, negativeWork });
  const sourceHash = await sourceDigest(root, changedFiles);
  return {
    schema_version: PROOF_FIELD_SCHEMA_VERSION,
    generated_at: nowIso(),
    theory: 'Potential Proof Field',
    intent: intent || null,
    source_hash: sourceHash,
    changed_files: changedFiles,
    invariant_ledger: INVARIANT_LEDGER,
    proof_cones: selectedCones,
    negative_work_cache: negativeWork,
    fast_lane_decision: fastLane,
    next_action: nextAction(fastLane)
  };
}

export async function writeProofFieldReport(root, opts = {}) {
  const report = await buildProofField(root, opts);
  const file = path.join(root, '.sneakoscope', 'reports', `proof-field-${Date.now()}.json`);
  await writeJsonAtomic(file, report);
  return { ...report, report_path: file };
}

export function validateProofFieldReport(report = {}) {
  const issues = [];
  if (report.schema_version !== PROOF_FIELD_SCHEMA_VERSION) issues.push('schema_version');
  if (!Array.isArray(report.invariant_ledger) || !report.invariant_ledger.length) issues.push('invariant_ledger');
  if (!Array.isArray(report.proof_cones)) issues.push('proof_cones');
  if (!Array.isArray(report.negative_work_cache)) issues.push('negative_work_cache');
  if (!report.fast_lane_decision?.mode) issues.push('fast_lane_decision');
  if (report.fast_lane_decision?.mode === 'fast_lane' && report.fast_lane_decision?.escalate_on?.length < 1) issues.push('fast_lane_escalation');
  return { ok: issues.length === 0, issues };
}

export async function proofFieldFixture() {
  const report = await buildProofField(process.cwd(), {
    intent: 'small CLI help surface update',
    changedFiles: ['src/cli/maintenance-commands.mjs', 'src/core/routes.mjs']
  });
  return {
    report,
    validation: validateProofFieldReport(report),
    checks: {
      route_cone_selected: report.proof_cones.some((cone) => cone.id === 'route_surface'),
      cli_cone_selected: report.proof_cones.some((cone) => cone.id === 'cli_runtime'),
      catastrophic_guard_present: report.invariant_ledger.some((item) => item.id === 'db-catastrophic-guard'),
      negative_release_work_recorded: report.negative_work_cache.some((item) => item.id === 'full_release_gate' && item.disposition === 'skip_with_evidence')
    }
  };
}

async function gitChangedFiles(root) {
  const result = await runProcess('git', ['diff', '--name-only', 'HEAD', '--'], { cwd: root, timeoutMs: 10000, maxOutputBytes: 128 * 1024 });
  if (result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeChangedFiles(files = []) {
  return [...new Set((files || []).flatMap((value) => String(value || '').split(',')).map((file) => file.trim()).filter(Boolean))]
    .sort();
}

function selectProofCones(files, intent) {
  const haystack = `${files.join('\n')}\n${intent || ''}`;
  const selected = PROOF_CONE_DEFINITIONS
    .filter((cone) => cone.match.some((re) => re.test(haystack)))
    .map((cone) => ({
      id: cone.id,
      surfaces: cone.surfaces,
      verification: cone.verification,
      matched_files: files.filter((file) => cone.match.some((re) => re.test(file)))
    }));
  if (!selected.length) {
    selected.push({
      id: 'generic_local_change',
      surfaces: ['unknown'],
      verification: ['npm run packcheck', 'focused relevant tests or documented justification'],
      matched_files: files
    });
  }
  return selected;
}

function riskSummary(files, cones, intent) {
  const text = `${files.join('\n')}\n${intent || ''}`;
  const flags = {
    database: /\b(db|database|supabase|sql|migration|rls|schema)\b/i.test(text),
    security: /\b(auth|permission|token|secret|security|권한|보안)\b/i.test(text),
    visual_forensic: /from-chat-img|screenshot|visual|이미지|스크린샷/i.test(text),
    release: /package\.json|package-lock\.json|CHANGELOG|release|publish/i.test(text),
    broad_change: files.length > 3,
    unknown_surface: cones.some((cone) => cone.id === 'generic_local_change')
  };
  const score = Object.values(flags).filter(Boolean).length;
  const level = score >= 3 ? 'high' : score === 2 ? 'medium' : score === 1 ? 'low' : 'minimal';
  return { level, score, flags };
}

function buildNegativeWorkCache(cones, risk) {
  const required = new Set(cones.flatMap((cone) => cone.verification));
  const candidates = new Set(cones.flatMap((cone) => cone.negative_work || []));
  const out = [];
  for (const id of candidates) {
    const blockedByRisk = (id === 'database_migration' && risk.flags.database)
      || (id === 'browser_ui_e2e' && risk.flags.visual_forensic);
    out.push({
      id,
      disposition: blockedByRisk ? 'not_skipped_risk_present' : 'skip_with_evidence',
      reason: blockedByRisk ? 'risk flag requires explicit verification' : 'selected proof cones do not touch this surface'
    });
  }
  if (!required.has('npm run release:check') && !risk.flags.release) {
    out.push({ id: 'full_release_gate', disposition: 'skip_with_evidence', reason: 'no package/release surface in selected cones' });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function fastLaneDecision({ changedFiles, selectedCones, risk, negativeWork }) {
  const verification = [...new Set(selectedCones.flatMap((cone) => cone.verification))];
  const safeSkips = negativeWork.filter((item) => item.disposition === 'skip_with_evidence').map((item) => item.id);
  const blockers = [];
  if (!changedFiles.length) blockers.push('no_changed_files');
  if (changedFiles.length > 3) blockers.push('broad_change_set');
  if (risk.flags.database) blockers.push('database_surface');
  if (risk.flags.security) blockers.push('security_surface');
  if (risk.flags.visual_forensic) blockers.push('visual_forensic_surface');
  if (risk.flags.unknown_surface) blockers.push('unknown_surface');
  const mode = blockers.length ? (risk.level === 'high' ? 'full_proof' : 'balanced') : 'fast_lane';
  return {
    mode,
    eligible: mode === 'fast_lane',
    blockers,
    verification,
    negative_work: safeSkips,
    escalate_on: ['verification_failed', 'proof_cone_unknown', 'source_hash_changed', 'unsupported_claim', 'user_scope_expanded']
  };
}

function nextAction(decision) {
  if (decision.mode === 'fast_lane') return 'apply minimal patch, run listed verification, then Honest Mode against the proof field report';
  if (decision.mode === 'balanced') return 'narrow the change set or run parent-led implementation with listed verification and reviewer escalation if checks fail';
  return 'use full Team/Honest proof path; fast lane is intentionally blocked for this risk state';
}

async function sourceDigest(root, files) {
  const rows = [];
  for (const file of files) {
    const abs = path.resolve(root, file);
    if (!abs.startsWith(path.resolve(root))) continue;
    const text = await readText(abs, null);
    rows.push([rel(root, abs), text == null ? null : sha256(text).slice(0, 16)]);
  }
  return sha256(JSON.stringify(rows)).slice(0, 24);
}
