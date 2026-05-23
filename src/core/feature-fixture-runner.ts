import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FEATURE_FIXTURE_COMMAND_TIMEOUT_MS = 60_000;

export function runFeatureFixture(feature: any, {
  root = process.cwd(),
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-feature-fixture-')),
  execute = false,
  validateArtifacts = false,
  commandArgs = null
}: any = {}) {
  const fixture = feature.fixture || {};
  const expected = normalizeExpectedArtifacts(fixture.expected_artifacts);
  const useHermeticRoot = fixture.root_mode !== 'source_checkout_required' && (execute || validateArtifacts || fixture.kind === 'execute_and_validate_artifacts');
  const projectRoot = useHermeticRoot ? prepareHermeticFixtureRoot(root, tempRoot) : root;
  const latestBefore = latestMissionId(projectRoot);
  const execution = execute && commandArgs ? executeCommand(root, projectRoot, commandArgs, fixture) : null;
  const latestAfter = execution?.mission_id || latestMissionId(projectRoot) || latestBefore;
  const shouldValidateArtifacts = validateArtifacts && (fixture.kind === 'execute_and_validate_artifacts' || execution);
  const artifacts = shouldValidateArtifacts
    ? expected.map((artifact: any) => inspectExpectedArtifact(projectRoot, tempRoot, artifact, { latestMissionId: latestAfter }))
    : expected.map((artifact: any) => ({ path: artifact.path, requested_path: artifact.path, schema: artifact.schema || inferSchema(artifact.path), exists: null, schema_ok: null, content_ok: null, skipped: 'static_contract' }));
  const artifactFailures = shouldValidateArtifacts
    ? artifacts.filter((artifact: any) => !artifact.exists || !artifact.schema_ok || !artifact.content_ok).map((artifact: any) => `${feature.id}:${artifact.path}:${artifact.failure || 'artifact_invalid'}`)
    : [];
  const shouldScanSecrets = useHermeticRoot || Boolean(execution) || shouldValidateArtifacts;
  const noPlaintextSecrets = shouldScanSecrets ? validateNoPlaintextSecrets(projectRoot) : true;
  return {
    id: feature.id,
    kind: fixture.kind || 'static',
    command: fixture.command || null,
    temp_root: useHermeticRoot ? projectRoot : tempRoot,
    root_mode: useHermeticRoot ? 'hermetic_temp_project' : 'source_checkout_required',
    latest_mission_id: latestAfter,
    executed: Boolean(execution),
    execution,
    expected_artifacts: artifacts,
    artifact_schema_validated: validateArtifacts,
    no_plaintext_secrets: noPlaintextSecrets,
    secret_scan: shouldScanSecrets ? 'bounded_runtime_artifacts' : 'skipped_no_runtime_artifacts',
    ok: (!execution || execution.ok) && artifactFailures.length === 0 && noPlaintextSecrets && !(validateArtifacts && fixture.kind === 'execute_and_validate_artifacts' && expected.length && !execution),
    failures: [
      ...(!fixture.command && fixture.status === 'pass' ? [`${feature.id}:fixture_command_missing`] : []),
      ...(validateArtifacts && fixture.kind === 'execute_and_validate_artifacts' && expected.length && !execution ? [`${feature.id}:command_not_executed_for_artifact_validation`] : []),
      ...(execution && !execution.ok ? [fixtureExecutionFailure(feature.id, execution)] : []),
      ...(noPlaintextSecrets ? [] : [`${feature.id}:plaintext_secret_detected`]),
      ...artifactFailures
    ]
  };
}

export function writeFeatureFixtureReports(root: any, report: any) {
  const reportDir = path.join(root, '.sneakoscope', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'feature-fixtures.json');
  const mdPath = path.join(reportDir, 'feature-fixtures.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderFeatureFixtureMarkdown(report));
  return { json: jsonPath, md: mdPath };
}

function executeCommand(sourceRoot: any, projectRoot: any, spec: any, fixture: any = {}) {
  const normalized = Array.isArray(spec) ? { command: spec } : spec;
  const setup = [
    ...(fixture.root_mode === 'source_checkout_required' ? [] : [['setup', '--local-only', '--json']]),
    ...(normalized.setup || [])
  ];
  const setupResults = setup.map((args: any) => spawnSks(sourceRoot, projectRoot, args));
  const command = normalized.command || normalized.args || [];
  const result: any = command.length ? spawnSks(sourceRoot, projectRoot, command) : { status: 0, signal: null, ok: true, stdout_bytes: 0, stderr_bytes: 0, args: [] };
  const missionId = result.mission_id || [...setupResults].reverse().find((row: any) => row.mission_id)?.mission_id || null;
  return {
    args: command,
    setup: setupResults,
    mission_id: missionId,
    status: result.status,
    signal: result.signal || null,
    ok: setupResults.every((row: any) => row.ok) && result.ok,
    stdout_bytes: result.stdout_bytes,
    stderr_bytes: result.stderr_bytes
  };
}

function spawnSks(sourceRoot: any, projectRoot: any, args: any = []) {
  const entrypoint = resolveSksEntrypoint(sourceRoot);
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: FEATURE_FIXTURE_COMMAND_TIMEOUT_MS,
    env: { ...process.env, CI: 'true', SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  const parsed = parseJsonOutput(result.stdout || '');
  const timedOut = (result.error as any)?.code === 'ETIMEDOUT';
  return {
    args,
    status: result.status,
    signal: result.signal || null,
    ok: result.status === 0,
    timed_out: timedOut,
    timeout_ms: FEATURE_FIXTURE_COMMAND_TIMEOUT_MS,
    error_code: (result.error as any)?.code || null,
    mission_id: parsed?.mission_id || parsed?.id || parsed?.proof?.mission_id || parsed?.completion_proof?.mission_id || null,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || ''),
    stderr_tail: String(result.stderr || '').slice(-600)
  };
}

function fixtureExecutionFailure(featureId: any, execution: any) {
  if (execution?.timed_out) return `${featureId}:command_timeout_${execution.timeout_ms || 'unknown'}`;
  return `${featureId}:command_exit_${execution?.status}`;
}

function resolveSksEntrypoint(sourceRoot: any) {
  const candidates = [
    path.join(sourceRoot, 'dist', 'bin', 'sks.js'),
    path.join(sourceRoot, 'bin', 'sks.js')
  ];
  return candidates.find((candidate: any) => fs.existsSync(candidate)) || candidates[0];
}

function prepareHermeticFixtureRoot(sourceRoot: any, tempRoot: any) {
  fs.mkdirSync(tempRoot, { recursive: true });
  const packageFile = path.join(tempRoot, 'package.json');
  if (!fs.existsSync(packageFile)) {
    fs.writeFileSync(packageFile, `${JSON.stringify({ name: 'sks-hermetic-fixture', private: true, version: '0.0.0' }, null, 2)}\n`);
  }
  const readme = path.join(tempRoot, 'README.md');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, '# SKS Hermetic Fixture\n');
  copyFixtureFile(sourceRoot, tempRoot, 'test/fixtures/images/one-by-one.png');
  return tempRoot;
}

function copyFixtureFile(sourceRoot: any, tempRoot: any, rel: any) {
  const src = path.join(sourceRoot, rel);
  const dest = path.join(tempRoot, rel);
  if (!fs.existsSync(src) || fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function parseJsonOutput(text: any = '') {
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

export function resolveExpectedArtifactPath(root: any, rel: any, { latestMissionId = null }: any = {}) {
  const normalized = String(rel || '').replace('<latest>', latestMissionId || 'latest').replace('<mission-id>', latestMissionId || 'latest').replace('<root>', '.');
  if (normalized.startsWith('.sneakoscope/')) return path.join(root, normalized);
  if (latestMissionId) return path.join(root, '.sneakoscope', 'missions', latestMissionId, normalized);
  return path.join(root, normalized);
}

function inspectExpectedArtifact(root: any, tempRoot: any, artifact: any, ctx: any = {}) {
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

function normalizeExpectedArtifacts(items: any = []) {
  return (items || []).map((artifact: any) => {
    if (typeof artifact === 'string') return { path: artifact, schema: inferSchema(artifact) };
    return { ...artifact, schema: artifact.schema || inferSchema(artifact.path) };
  });
}

function inferSchema(file: any = '') {
  if (file.includes('completion-proof')) return 'sks.completion-proof.v1';
  if (file.includes('image-voxel-ledger')) return 'sks.image-voxel-ledger.v1';
  if (file.includes('visual-anchors')) return 'sks.visual-anchors.v1';
  if (file.includes('image-assets')) return 'sks.image-assets.v1';
  if (file.endsWith('.json')) return 'sks.fixture-artifact.v1';
  return null;
}

function latestMissionId(root: any) {
  const dir = path.join(root, '.sneakoscope', 'missions');
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry: any) => entry.isDirectory() && entry.name.startsWith('M-')).map((entry: any) => entry.name).sort();
  return entries.at(-1) || null;
}

function renderFeatureFixtureMarkdown(report: any = {}) {
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

export function validateCompletionProofArtifact(file: any) {
  const proof = JSON.parse(fs.readFileSync(file, 'utf8'));
  return proof.schema === 'sks.completion-proof.v1' && ['verified', 'verified_partial', 'blocked'].includes(proof.status);
}

export function validateImageVoxelArtifact(file: any, { requireAnchors = true, requireRelations = false }: any = {}) {
  const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
  const anchors = ledger.anchors?.length || 0;
  const relations = ledger.relations?.length || 0;
  return ledger.schema === 'sks.image-voxel-ledger.v1' && (!requireAnchors || anchors >= 1) && (!requireRelations || relations >= 1);
}

export function validateNoPlaintextSecrets(root: any) {
  const secretPattern = /(sk-proj-[A-Za-z0-9_-]{8,}|sk-clb-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{8,}|(?:CODEX_ACCESS_TOKEN|OPENAI_API_KEY)\s*[:=]\s*["']?(?:sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,}))/;
  const reportDir = path.join(root, '.sneakoscope');
  if (!fs.existsSync(reportDir)) return true;
  const stack = secretScanRoots(reportDir);
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const currentStat = fs.statSync(current);
    if (currentStat.isFile()) {
      if (hasSecretLikeContent(current, secretPattern)) return false;
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (hasSecretLikeContent(p, secretPattern)) return false;
    }
  }
  return true;
}

export const validateDbEvidenceArtifact = validateCompletionProofArtifact;
export const validateHookReplayArtifact = validateCompletionProofArtifact;

function secretScanRoots(reportDir: any) {
  const roots: string[] = [];
  const missionDir = path.join(reportDir, 'missions');
  for (const entry of fs.readdirSync(reportDir, { withFileTypes: true })) {
    const p = path.join(reportDir, entry.name);
    if (!entry.isDirectory()) roots.push(p);
    else if (entry.name === 'missions') roots.push(...recentMissionDirs(missionDir));
    else roots.push(p);
  }
  return roots.length ? roots : [reportDir];
}

function recentMissionDirs(missionDir: any) {
  if (!fs.existsSync(missionDir)) return [];
  return fs.readdirSync(missionDir, { withFileTypes: true })
    .filter((entry: any) => entry.isDirectory() && entry.name.startsWith('M-'))
    .map((entry: any) => path.join(missionDir, entry.name))
    .sort()
    .slice(-12);
}

function hasSecretLikeContent(file: any, secretPattern: any) {
  if (!/\.(json|md|txt|jsonl)$/i.test(path.basename(file))) return false;
  return secretPattern.test(fs.readFileSync(file, 'utf8'));
}
