import fsp from 'node:fs/promises';
import path from 'node:path';
import { missionDir } from '../mission.js';
import { exists, readText, rel, sha256 } from '../fsx.js';
import { routeRequiresImageVoxelAnchors } from '../proof/route-proof-policy.js';
import { evidenceHasPlaintextSecret, redactEvidence } from './evidence-redaction.js';
import { createEvidenceRecord, validateEvidenceRecord } from './evidence-schema.js';
import { dedupeEvidence } from './evidence-dedupe.js';
import { fileFreshness, lastJsonlEventTime } from './evidence-freshness.js';
import { writeEvidenceIndex } from './evidence-store.js';

export async function writeEvidenceIndexForProof(root: any, proof: any = {}, opts: any = {}) {
  const missionId = proof.mission_id || opts.missionId || null;
  const route = proof.route || opts.route || null;
  const staleAfter = missionId ? await lastJsonlEventTime(path.join(missionDir(root, missionId), 'events.jsonl')) : null;
  const candidates = await evidenceCandidatesForProof(root, proof, { missionId, route });
  const records: any[] = [];
  const issues: any[] = [];
  for (const candidate of candidates) {
    const record = await evidenceRecordForCandidate(root, candidate, { missionId, staleAfter, proof });
    if (!record) continue;
    const validation = validateEvidenceRecord(record);
    if (!validation.ok) record.issues.push(...validation.issues);
    if (record.issues.length) issues.push(...record.issues.map((issue: any) => `${record.path || record.id}:${issue}`));
    records.push(record);
  }
  const deduped = dedupeEvidence(records);
  const status = evidenceStatus(deduped, issues);
  return writeEvidenceIndex(root, {
    missionId,
    route,
    records: deduped.map(redactEvidence),
    issues: [...new Set(issues)],
    status
  });
}

export async function evidenceCandidatesForProof(root: any, proof: any = {}, opts: any = {}) {
  const missionId = opts.missionId || proof.mission_id || null;
  const route = opts.route || proof.route || null;
  const candidates: any[] = [];
  if (missionId) {
    candidates.push({ kind: 'proof', relPath: `.sneakoscope/missions/${missionId}/completion-proof.json`, source: sourceForProof(proof) });
    candidates.push({ kind: 'route_contract', relPath: `.sneakoscope/missions/${missionId}/route-completion-contract.json`, source: 'real', optional: true });
    candidates.push({ kind: 'trust_report', relPath: `.sneakoscope/missions/${missionId}/trust-report.json`, source: 'real', optional: true });
  }
  addArtifactCandidates(candidates, proof.evidence?.artifacts, missionId);
  addGateCandidate(candidates, proof.evidence?.route_gate, missionId);
  addScoutCandidates(candidates, proof.evidence?.scouts);
  addDbCandidates(candidates, proof.evidence?.db || proof.evidence?.db_safety, missionId);
  addTestCandidates(candidates, proof.evidence?.tests, missionId);
  addWrongnessCandidates(candidates, proof.evidence?.wrongness, missionId);
  addComputerUseCandidates(candidates, proof.evidence?.computer_use, missionId);
  if (missionId && routeRequiresImageVoxelAnchors(route)) {
    candidates.push({ kind: 'image_voxel', relPath: `.sneakoscope/missions/${missionId}/image-voxel-ledger.json`, source: proof.evidence?.image_voxels?.mock ? 'mock' : sourceForProof(proof) });
  }
  return uniqueCandidates(candidates).filter((candidate: any) => candidate.relPath);
}

async function evidenceRecordForCandidate(root: any, candidate: any, { missionId, staleAfter, proof }: any) {
  const relPath = normalizeRelPath(candidate.relPath, missionId, root);
  const absolute = path.resolve(root, relPath);
  const freshness = await fileFreshness(absolute, { staleAfter: candidate.ignoreStale ? null : staleAfter });
  if (candidate.optional && !freshness.exists) return null;
  const issues = candidate.optional && !freshness.exists ? [] : [...freshness.issues];
  let digest = null;
  let secret = false;
  if (freshness.exists) {
    const data = await fsp.readFile(absolute);
    digest = sha256(data);
    const text = isTextEvidence(relPath) ? await readText(absolute, '') : '';
    secret = text ? evidenceHasPlaintextSecret(text) : false;
    if (secret) issues.push('plaintext_secret');
  } else if (!candidate.optional) {
    issues.push('required_evidence_path_missing');
  }
  const source = issues.includes('required_evidence_path_missing') ? 'blocked' : normalizeSource(candidate.source || sourceForPath(relPath, proof));
  const blocked = issues.includes('plaintext_secret') || issues.includes('stale') || issues.includes('required_evidence_path_missing');
  return createEvidenceRecord({
    mission_id: missionId,
    kind: candidate.kind,
    source,
    path: relPath,
    sha256: digest,
    freshness: freshness.freshness,
    blocked,
    issues
  });
}

function addArtifactCandidates(candidates: any, artifacts: any = [], missionId: any = null) {
  for (const artifact of artifacts || []) {
    const relPath = typeof artifact === 'string' ? artifact : artifact?.path;
    if (!relPath) continue;
    candidates.push({
      kind: artifact?.kind || inferKind(relPath),
      relPath: normalizeRelPath(relPath, missionId),
      source: artifact?.source || sourceForPath(relPath),
      optional: artifact?.optional === true,
      ignoreStale: artifact?.ignoreStale === true
    });
  }
}

function addGateCandidate(candidates: any, gate: any = null, missionId: any = null) {
  const relPath = typeof gate === 'string' ? gate : gate?.source || gate?.path || null;
  if (relPath) candidates.push({ kind: 'route_gate', relPath: normalizeRelPath(relPath, missionId), source: 'real' });
}

function addScoutCandidates(candidates: any, scouts: any = null) {
  if (!scouts || scouts.required === false) return;
  for (const key of ['consensus', 'handoff', 'gate_file', 'performance', 'engine_result']) {
    if (scouts[key]) candidates.push({ kind: 'scout', relPath: scouts[key], source: scouts.real_parallel ? 'real' : 'fixture' });
  }
}

function addDbCandidates(candidates: any, db: any = null, missionId: any = null) {
  const rows = Array.isArray(db) ? db : [db].filter(Boolean);
  for (const row of rows) {
    const relPath = row?.path || row?.report || row?.evidence || null;
    if (relPath) candidates.push({ kind: 'db_safety', relPath: normalizeRelPath(relPath, missionId), source: sourceForPath(relPath) });
  }
}

function addTestCandidates(candidates: any, tests: any = null, missionId: any = null) {
  const rows = Array.isArray(tests) ? tests : [tests].filter(Boolean);
  for (const row of rows) {
    const relPath = row?.path || row?.report || row?.evidence || null;
    if (relPath) candidates.push({ kind: 'test', relPath: normalizeRelPath(relPath, missionId), source: sourceForPath(relPath) });
  }
}

function addWrongnessCandidates(candidates: any, wrongness: any = null, missionId: any = null) {
  if (!wrongness) {
    candidates.push({ kind: 'wrongness', relPath: '.sneakoscope/wiki/wrongness-ledger.json', source: 'real', optional: true, ignoreStale: true });
    if (missionId) candidates.push({ kind: 'wrongness', relPath: `.sneakoscope/missions/${missionId}/wrongness-ledger.json`, source: 'real', optional: true, ignoreStale: true });
    return;
  }
  candidates.push({ kind: 'wrongness', relPath: wrongness.project_ledger || '.sneakoscope/wiki/wrongness-ledger.json', source: 'real', optional: true, ignoreStale: true });
  if (wrongness.mission_ledger) candidates.push({ kind: 'wrongness', relPath: wrongness.mission_ledger, source: 'real', optional: true, ignoreStale: true });
  candidates.push({ kind: 'image_wrongness', relPath: '.sneakoscope/wiki/image-wrongness-index.json', source: 'real', optional: true, ignoreStale: true });
  if (missionId) candidates.push({ kind: 'image_wrongness', relPath: `.sneakoscope/missions/${missionId}/image-wrongness-ledger.json`, source: 'real', optional: true, ignoreStale: true });
}

function addComputerUseCandidates(candidates: any, computerUse: any = null, missionId: any = null) {
  const relPath = computerUse?.live_evidence_path || computerUse?.live_evidence?.path || null;
  if (relPath) candidates.push({ kind: 'computer_use', relPath: normalizeRelPath(relPath, missionId), source: 'real', ignoreStale: true });
  else if (missionId) candidates.push({ kind: 'computer_use', relPath: `.sneakoscope/missions/${missionId}/computer-use-live-evidence.json`, source: 'blocked', optional: true, ignoreStale: true });
}

function uniqueCandidates(candidates: any) {
  const seen = new Set();
  const out: any[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.relPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function normalizeRelPath(value: any = '', missionId: any = null, root: any = process.cwd()) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (path.isAbsolute(raw)) return rel(root, raw);
  if (raw.startsWith('.sneakoscope/')) return raw;
  if (missionId && !raw.includes('/')) return `.sneakoscope/missions/${missionId}/${raw}`;
  return raw.replace(/^\.\//, '');
}

function sourceForProof(proof: any = {}) {
  const hay = JSON.stringify([proof.unverified, proof.claims, proof.evidence?.image_voxels]);
  if (/static_contract/i.test(hay)) return 'static_contract';
  if (/mock/i.test(hay)) return 'mock';
  if (/fixture/i.test(hay)) return 'fixture';
  return 'real';
}

function sourceForPath(relPath: any = '', proof: any = {}) {
  const hay = `${relPath} ${JSON.stringify(proof?.unverified || [])}`;
  if (/test\/fixtures|fixture/i.test(hay)) return 'fixture';
  if (/mock/i.test(hay)) return 'mock';
  if (/static[-_]?contract/i.test(hay)) return 'static_contract';
  return 'real';
}

function normalizeSource(source: any) {
  return ['real', 'mock', 'static_contract', 'fixture', 'blocked'].includes(source) ? source : 'real';
}

function inferKind(relPath: any = '') {
  if (/completion-proof\.json$/.test(relPath)) return 'proof';
  if (/route-completion-contract\.json$/.test(relPath)) return 'route_contract';
  if (/trust-report\.json$/.test(relPath)) return 'trust_report';
  if (/image-wrongness/.test(relPath)) return 'image_wrongness';
  if (/wrongness/.test(relPath)) return 'wrongness';
  if (/image-voxel-ledger\.json$|visual-anchors\.json$|image-assets\.json$/.test(relPath)) return 'image_voxel';
  if (/computer-use-live-evidence\.json$|computer-use.*evidence/.test(relPath)) return 'computer_use';
  if (/scout/.test(relPath)) return 'scout';
  if (/db/.test(relPath)) return 'db_safety';
  if (/blackbox|npx|global-shim|pack-install/.test(relPath)) return 'blackbox';
  if (/test|gate|report/.test(relPath)) return 'test';
  return 'artifact';
}

function isTextEvidence(relPath: any = '') {
  return /\.(json|jsonl|md|txt|log|mjs|js|ts|tsx|jsx|html|css|toml|yml|yaml)$/i.test(relPath);
}

function evidenceStatus(records: any = [], issues: any = []) {
  if (records.some((record: any) => record.trust === 'blocked') || issues.some((issue: any) => /required_evidence_path_missing|plaintext_secret|stale/.test(issue))) return 'blocked';
  if (records.some((record: any) => record.source !== 'real' || record.trust !== 'high')) return 'verified_partial';
  return records.length ? 'verified' : 'not_verified';
}
