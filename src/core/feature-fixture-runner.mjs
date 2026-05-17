import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runFeatureFixture(feature, {
  root = process.cwd(),
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-feature-fixture-')),
  execute = false,
  validateArtifacts = false,
  commandArgs = null
} = {}) {
  const fixture = feature.fixture || {};
  const expected = normalizeExpectedArtifacts(fixture.expected_artifacts);
  const latestBefore = latestMissionId(root);
  const execution = execute && commandArgs ? executeCommand(root, commandArgs) : null;
  const latestAfter = execution?.mission_id || latestMissionId(root) || latestBefore;
  const shouldValidateArtifacts = validateArtifacts && (fixture.kind === 'execute_and_validate_artifacts' || execution);
  const artifacts = shouldValidateArtifacts
    ? expected.map((artifact) => inspectExpectedArtifact(root, tempRoot, artifact, { latestMissionId: latestAfter }))
    : expected.map((artifact) => ({ path: artifact.path, requested_path: artifact.path, schema: artifact.schema || inferSchema(artifact.path), exists: null, schema_ok: null, content_ok: null, skipped: 'contract_only' }));
  const artifactFailures = shouldValidateArtifacts
    ? artifacts.filter((artifact) => !artifact.exists || !artifact.schema_ok || !artifact.content_ok).map((artifact) => `${feature.id}:${artifact.path}:${artifact.failure || 'artifact_invalid'}`)
    : [];
  return {
    id: feature.id,
    kind: fixture.kind || 'static',
    command: fixture.command || null,
    temp_root: tempRoot,
    latest_mission_id: latestAfter,
    executed: Boolean(execution),
    execution,
    expected_artifacts: artifacts,
    artifact_schema_validated: validateArtifacts,
    ok: (!execution || execution.ok) && artifactFailures.length === 0 && !(validateArtifacts && fixture.kind === 'execute_and_validate_artifacts' && expected.length && !execution),
    failures: [
      ...(!fixture.command && fixture.status === 'pass' ? [`${feature.id}:fixture_command_missing`] : []),
      ...(validateArtifacts && fixture.kind === 'execute_and_validate_artifacts' && expected.length && !execution ? [`${feature.id}:command_not_executed_for_artifact_validation`] : []),
      ...(execution && !execution.ok ? [`${feature.id}:command_exit_${execution.status}`] : []),
      ...artifactFailures
    ]
  };
}

export function writeFeatureFixtureReports(root, report) {
  const reportDir = path.join(root, '.sneakoscope', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'feature-fixtures.json');
  const mdPath = path.join(reportDir, 'feature-fixtures.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderFeatureFixtureMarkdown(report));
  return { json: jsonPath, md: mdPath };
}

function executeCommand(root, spec) {
  const normalized = Array.isArray(spec) ? { command: spec } : spec;
  const setup = normalized.setup || [];
  const setupResults = setup.map((args) => spawnSks(root, args));
  const command = normalized.command || normalized.args || [];
  const result = command.length ? spawnSks(root, command) : { status: 0, signal: null, ok: true, stdout_bytes: 0, stderr_bytes: 0, args: [] };
  const missionId = result.mission_id || [...setupResults].reverse().find((row) => row.mission_id)?.mission_id || null;
  return {
    args: command,
    setup: setupResults,
    mission_id: missionId,
    status: result.status,
    signal: result.signal || null,
    ok: setupResults.every((row) => row.ok) && result.ok,
    stdout_bytes: result.stdout_bytes,
    stderr_bytes: result.stderr_bytes
  };
}

function spawnSks(root, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'bin', 'sks.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, CI: 'true', SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  const parsed = parseJsonOutput(result.stdout || '');
  return {
    args,
    status: result.status,
    signal: result.signal || null,
    ok: result.status === 0,
    mission_id: parsed?.mission_id || parsed?.id || parsed?.proof?.mission_id || parsed?.completion_proof?.mission_id || null,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || ''),
    stderr_tail: String(result.stderr || '').slice(-600)
  };
}

function parseJsonOutput(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return null;
}

export function resolveExpectedArtifactPath(root, rel, { latestMissionId = null } = {}) {
  const normalized = String(rel || '').replace('<latest>', latestMissionId || 'latest').replace('<mission-id>', latestMissionId || 'latest').replace('<root>', '.');
  if (normalized.startsWith('.sneakoscope/')) return path.join(root, normalized);
  if (latestMissionId) return path.join(root, '.sneakoscope', 'missions', latestMissionId, normalized);
  return path.join(root, normalized);
}

function inspectExpectedArtifact(root, tempRoot, artifact, ctx = {}) {
  const rel = artifact.path;
  const file = resolveExpectedArtifactPath(root, rel, ctx);
  const exists = fs.existsSync(file);
  const schema = artifact.schema || inferSchema(rel);
  const result = {
    path: path.relative(root, file).split(path.sep).join('/'),
    requested_path: rel,
    schema,
    exists,
    schema_ok: false,
    content_ok: false,
    temp_root: tempRoot
  };
  if (!exists) return { ...result, failure: 'missing' };
  if (file.endsWith('.md')) return { ...result, schema_ok: true, content_ok: fs.readFileSync(file, 'utf8').trim().length > 0 };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ...result, failure: 'json_parse' };
  }
  if (schema === 'sks.completion-proof.v1') return { ...result, schema_ok: parsed.schema === schema, content_ok: ['verified', 'verified_partial', 'blocked'].includes(parsed.status), status: parsed.status };
  if (schema === 'sks.image-voxel-ledger.v1') {
    const anchorCount = Array.isArray(parsed.anchors) ? parsed.anchors.length : 0;
    const relationCount = Array.isArray(parsed.relations) ? parsed.relations.length : 0;
    const requireAnchors = artifact.require_anchors !== false;
    const requireRelations = artifact.require_relations === true;
    return { ...result, schema_ok: parsed.schema === schema, content_ok: (!requireAnchors || anchorCount >= 1) && (!requireRelations || relationCount >= 1), anchor_count: anchorCount, relation_count: relationCount };
  }
  if (schema === 'sks.visual-anchors.v1') return { ...result, schema_ok: parsed.schema === schema, content_ok: Array.isArray(parsed.anchors) && (artifact.require_anchors === false || parsed.anchors.length >= 1), anchor_count: parsed.anchors?.length || 0 };
  if (schema === 'sks.fixture-artifact.v1') return { ...result, schema_ok: Boolean(parsed.schema || parsed.schema_version || Object.hasOwn(parsed, 'passed') || Object.hasOwn(parsed, 'ok')), content_ok: true };
  return { ...result, schema_ok: schema ? parsed.schema === schema || parsed.schema_version != null : true, content_ok: true };
}

function normalizeExpectedArtifacts(items = []) {
  return (items || []).map((artifact) => {
    if (typeof artifact === 'string') return { path: artifact, schema: inferSchema(artifact) };
    return { ...artifact, schema: artifact.schema || inferSchema(artifact.path) };
  });
}

function inferSchema(file = '') {
  if (file.includes('completion-proof')) return 'sks.completion-proof.v1';
  if (file.includes('image-voxel-ledger')) return 'sks.image-voxel-ledger.v1';
  if (file.includes('visual-anchors')) return 'sks.visual-anchors.v1';
  if (file.includes('image-assets')) return 'sks.image-assets.v1';
  if (file.endsWith('.json')) return 'sks.fixture-artifact.v1';
  return null;
}

function latestMissionId(root) {
  const dir = path.join(root, '.sneakoscope', 'missions');
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('M-')).map((entry) => entry.name).sort();
  return entries.at(-1) || null;
}

function renderFeatureFixtureMarkdown(report = {}) {
  const lines = [
    '# SKS Feature Fixtures',
    '',
    `- Status: ${report.ok ? 'pass' : 'blocked'}`,
    `- Checked: ${report.checked || 0}`,
    `- Executed: ${report.executed || 0}`,
    `- Artifact/schema validated: ${report.artifact_schema_validated || 0}`,
    ''
  ];
  if (report.failures?.length) {
    lines.push('## Failures', '');
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  return `${lines.join('\n')}\n`;
}

export function validateCompletionProofArtifact(file) {
  const proof = JSON.parse(fs.readFileSync(file, 'utf8'));
  return proof.schema === 'sks.completion-proof.v1' && ['verified', 'verified_partial', 'blocked'].includes(proof.status);
}

export function validateImageVoxelArtifact(file, { requireAnchors = true, requireRelations = false } = {}) {
  const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
  const anchors = ledger.anchors?.length || 0;
  const relations = ledger.relations?.length || 0;
  return ledger.schema === 'sks.image-voxel-ledger.v1' && (!requireAnchors || anchors >= 1) && (!requireRelations || relations >= 1);
}

export function validateNoPlaintextSecrets(root) {
  const secretPattern = /(sk-proj-|sk-clb-|github_pat_|CODEX_ACCESS_TOKEN|OPENAI_API_KEY)/;
  const reportDir = path.join(root, '.sneakoscope');
  if (!fs.existsSync(reportDir)) return true;
  const stack = [reportDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (/\.(json|md|txt|jsonl)$/i.test(entry.name) && secretPattern.test(fs.readFileSync(p, 'utf8'))) return false;
    }
  }
  return true;
}

export const validateDbEvidenceArtifact = validateCompletionProofArtifact;
export const validateHookReplayArtifact = validateCompletionProofArtifact;
