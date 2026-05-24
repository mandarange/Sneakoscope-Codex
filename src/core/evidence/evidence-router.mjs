import fsp from 'node:fs/promises';
import path from 'node:path';
import { missionDir } from '../mission.mjs';
import { exists, readText, rel, sha256 } from '../fsx.mjs';
import { routeRequiresImageVoxelAnchors } from '../proof/route-proof-policy.mjs';
import { evidenceHasPlaintextSecret, redactEvidence } from './evidence-redaction.mjs';
import { createEvidenceRecord, validateEvidenceRecord } from './evidence-schema.mjs';
import { dedupeEvidence } from './evidence-dedupe.mjs';
import { fileFreshness, lastJsonlEventTime } from './evidence-freshness.mjs';
import { writeEvidenceIndex } from './evidence-store.mjs';

export async function writeEvidenceIndexForProof(root, proof = {}, opts = {}) {
  const missionId = proof.mission_id || opts.missionId || null;
  const route = proof.route || opts.route || null;
  const staleAfter = missionId ? await lastJsonlEventTime(path.join(missionDir(root, missionId), 'events.jsonl')) : null;
  const candidates = await evidenceCandidatesForProof(root, proof, { missionId, route });
  const records = [];
  const issues = [];
  for (const candidate of candidates) {
    const record = await evidenceRecordForCandidate(root, candidate, { missionId, staleAfter, proof });
    if (!record) continue;
    const validation = validateEvidenceRecord(record);
    if (!validation.ok) record.issues.push(...validation.issues);
    if (record.issues.length) issues.push(...record.issues.map((issue) => `${record.path || record.id}:${issue}`));
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

export async function evidenceCandidatesForProof(root, proof = {}, opts = {}) {
  const missionId = opts.missionId || proof.mission_id || null;
  const route = opts.route || proof.route || null;
  const candidates = [];
  if (missionId) {
    candidates.push({ kind: 'proof', relPath: `.sneakoscope/missions/${missionId}/completion-proof.json`, source: sourceForProof(proof) });
    candidates.push({ kind: 'route_contract', relPath: `.sneakoscope/missions/${missionId}/route-completion-contract.json`, source: 'real', optional: true });
    candidates.push({ kind: 'trust_report', relPath: `.sneakoscope/missions/${missionId}/trust-report.json`, source: 'real', optional: true });
  }
  addArtifactCandidates(candidates, proof.evidence?.artifacts, missionId);
  addGateCandidate(candidates, proof.evidence?.route_gate, missionId);
  addAgentCandidates(candidates, proof.evidence?.agents);
  addDbCandidates(candidates, proof.evidence?.db || proof.evidence?.db_safety, missionId);
  addTestCandidates(candidates, proof.evidence?.tests, missionId);
  addWrongnessCandidates(candidates, proof.evidence?.wrongness, missionId);
  if (missionId && routeRequiresImageVoxelAnchors(route)) {
    candidates.push({ kind: 'image_voxel', relPath: `.sneakoscope/missions/${missionId}/image-voxel-ledger.json`, source: proof.evidence?.image_voxels?.mock ? 'mock' : sourceForProof(proof) });
  }
  return uniqueCandidates(candidates).filter((candidate) => candidate.relPath);
}

async function evidenceRecordForCandidate(root, candidate, { missionId, staleAfter, proof }) {
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

function addArtifactCandidates(candidates, artifacts = [], missionId = null) {
  for (const artifact of artifacts || []) {
    const relPath = typeof artifact === 'string' ? artifact : artifact?.path;
    if (!relPath) continue;
    candidates.push({ kind: inferKind(relPath), relPath: normalizeRelPath(relPath, missionId), source: sourceForPath(relPath) });
  }
}

function addGateCandidate(candidates, gate = null, missionId = null) {
  const relPath = typeof gate === 'string' ? gate : gate?.source || gate?.path || null;
  if (relPath) candidates.push({ kind: 'route_gate', relPath: normalizeRelPath(relPath, missionId), source: 'real' });
}

function addAgentCandidates(candidates, agents = null) {
  if (!agents || agents.required === false) return;
  for (const key of ['proof_graph', 'sessions', 'leases', 'consensus', 'events', 'task_board', 'concurrency_policy']) {
    if (agents[key]) candidates.push({ kind: 'agent', relPath: agents[key], source: agents.real_parallel ? 'real' : sourceForPath(agents[key]) });
  }
}

function addDbCandidates(candidates, db = null, missionId = null) {
  const rows = Array.isArray(db) ? db : [db].filter(Boolean);
  for (const row of rows) {
    const relPath = row?.path || row?.report || row?.evidence || null;
    if (relPath) candidates.push({ kind: 'db_safety', relPath: normalizeRelPath(relPath, missionId), source: sourceForPath(relPath) });
  }
}

function addTestCandidates(candidates, tests = null, missionId = null) {
  const rows = Array.isArray(tests) ? tests : [tests].filter(Boolean);
  for (const row of rows) {
    const relPath = row?.path || row?.report || row?.evidence || null;
    if (relPath) candidates.push({ kind: 'test', relPath: normalizeRelPath(relPath, missionId), source: sourceForPath(relPath) });
  }
}

function addWrongnessCandidates(candidates, wrongness = null, missionId = null) {
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

function uniqueCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.relPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function normalizeRelPath(value = '', missionId = null, root = process.cwd()) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (path.isAbsolute(raw)) return rel(root, raw);
  if (raw.startsWith('.sneakoscope/')) return raw;
  if (missionId && !raw.includes('/')) return `.sneakoscope/missions/${missionId}/${raw}`;
  return raw.replace(/^\.\//, '');
}

function sourceForProof(proof = {}) {
  const hay = JSON.stringify([proof.unverified, proof.claims, proof.evidence?.image_voxels]);
  if (/static_contract/i.test(hay)) return 'static_contract';
  if (/mock/i.test(hay)) return 'mock';
  if (/fixture/i.test(hay)) return 'fixture';
  return 'real';
}

function sourceForPath(relPath = '', proof = {}) {
  const hay = `${relPath} ${JSON.stringify(proof?.unverified || [])}`;
  if (/test\/fixtures|fixture/i.test(hay)) return 'fixture';
  if (/mock/i.test(hay)) return 'mock';
  if (/static[-_]?contract/i.test(hay)) return 'static_contract';
  return 'real';
}

function normalizeSource(source) {
  return ['real', 'mock', 'static_contract', 'fixture', 'blocked'].includes(source) ? source : 'real';
}

function inferKind(relPath = '') {
  if (/completion-proof\.json$/.test(relPath)) return 'proof';
  if (/route-completion-contract\.json$/.test(relPath)) return 'route_contract';
  if (/trust-report\.json$/.test(relPath)) return 'trust_report';
  if (/image-voxel-ledger\.json$|visual-anchors\.json$|image-assets\.json$/.test(relPath)) return 'image_voxel';
  if (/agent/.test(relPath)) return 'agent';
  if (/db/.test(relPath)) return 'db_safety';
  if (/blackbox|npx|global-shim|pack-install/.test(relPath)) return 'blackbox';
  if (/test|gate|report/.test(relPath)) return 'test';
  return 'artifact';
}

function isTextEvidence(relPath = '') {
  return /\.(json|jsonl|md|txt|log|mjs|js|ts|tsx|jsx|html|css|toml|yml|yaml)$/i.test(relPath);
}

function evidenceStatus(records = [], issues = []) {
  if (records.some((record) => record.trust === 'blocked') || issues.some((issue) => /required_evidence_path_missing|plaintext_secret|stale/.test(issue))) return 'blocked';
  if (records.some((record) => record.source !== 'real' || record.trust !== 'high')) return 'verified_partial';
  return records.length ? 'verified' : 'not_verified';
}
