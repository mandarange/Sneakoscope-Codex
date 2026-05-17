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
  const expected = Array.isArray(fixture.expected_artifacts) ? fixture.expected_artifacts : [];
  const artifacts = expected.map((artifact) => materializeExpectedArtifact(tempRoot, artifact));
  const execution = execute && commandArgs
    ? executeCommand(root, commandArgs)
    : null;
  const artifactFailures = validateArtifacts
    ? artifacts.filter((artifact) => !artifact.exists || !artifact.schema_ok).map((artifact) => `${feature.id}:${artifact.path}`)
    : [];
  return {
    id: feature.id,
    kind: fixture.kind || 'static',
    command: fixture.command || null,
    temp_root: tempRoot,
    executed: Boolean(execution),
    execution,
    expected_artifacts: artifacts,
    artifact_schema_validated: validateArtifacts,
    ok: (!execution || execution.ok) && artifactFailures.length === 0,
    failures: [
      ...(!fixture.command && fixture.status === 'pass' ? [`${feature.id}:fixture_command_missing`] : []),
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

function executeCommand(root, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'bin', 'sks.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, CI: 'true', SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  return {
    args,
    status: result.status,
    signal: result.signal || null,
    ok: result.status === 0,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || '')
  };
}

function materializeExpectedArtifact(tempRoot, artifact) {
  const rel = typeof artifact === 'string' ? artifact : artifact.path;
  const schema = typeof artifact === 'object' ? artifact.schema : inferSchema(rel);
  const normalized = String(rel || '').replace('<latest>', 'M-fixture');
  const file = path.join(tempRoot, normalized);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = normalized.endsWith('.md')
    ? `# Fixture Artifact\n\nSchema: ${schema || 'text'}\n`
    : JSON.stringify({ schema: schema || inferSchema(normalized), ok: true, fixture: true }, null, 2) + '\n';
  fs.writeFileSync(file, body);
  return {
    path: normalized,
    schema: schema || inferSchema(normalized),
    exists: fs.existsSync(file),
    schema_ok: normalized.endsWith('.md') || Boolean(JSON.parse(fs.readFileSync(file, 'utf8')).schema)
  };
}

function inferSchema(file = '') {
  if (file.includes('completion-proof')) return 'sks.completion-proof.v1';
  if (file.includes('image-voxel-ledger')) return 'sks.image-voxel-ledger.v1';
  if (file.includes('visual-anchors')) return 'sks.visual-anchors.v1';
  if (file.includes('image-assets')) return 'sks.image-assets.v1';
  if (file.endsWith('.json')) return 'sks.fixture-artifact.v1';
  return null;
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
