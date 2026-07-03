import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveExpectedArtifactPath } from './feature-fixture-runner.js';

const FIXTURE_COMMAND_TIMEOUT_MS = 60_000;

/**
 * Actually spawns a feature fixture's declared `command` string (safely tokenized,
 * no shell interpolation) for `execute` / `execute_and_validate_artifacts` fixtures,
 * checks the real exit code, validates any expected_artifacts that were declared
 * (string path or { path, schema } object form), and derives a real pass/fail status
 * from what actually happened rather than trusting fixture.status.
 *
 * This is distinct from runFeatureFixture() in feature-fixture-runner.ts, which only
 * executes fixtures present in an explicit safe-args allowlist. This function executes
 * whatever the fixture itself declares as its command, so it must tokenize defensively
 * and never hand a raw string to a shell.
 */
export function runFeatureFixture(feature: any, { root = process.cwd() }: { root?: string } = {}) {
  const id = feature?.id || feature?.featureId || 'unknown';
  const fixture = feature?.fixture || feature || {};
  const kind = fixture.kind;
  const claimedStatus = fixture.status;
  const expected = normalizeExpectedArtifacts(fixture.expected_artifacts);

  if (kind !== 'execute' && kind !== 'execute_and_validate_artifacts') {
    return {
      id,
      kind,
      executed: false,
      skipped: true,
      skip_reason: kind === 'mock' || kind === 'wiring_only' ? 'mock_or_wiring_only' : `kind_not_executable:${kind}`,
      claimed_status: claimedStatus,
      actual_status: claimedStatus,
      ok: true,
      command: fixture.command || null,
      artifacts: [],
      blockers: []
    };
  }

  if (!fixture.command || !String(fixture.command).trim()) {
    return {
      id,
      kind,
      executed: false,
      skipped: false,
      claimed_status: claimedStatus,
      actual_status: 'missing',
      ok: false,
      command: null,
      artifacts: [],
      blockers: [`${id}:fixture_command_missing`]
    };
  }

  const tokens = tokenizeCommand(fixture.command);
  const spawnEnv = { ...process.env, CI: 'true', SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_ENSURE_DIST_NO_REBUILD: '1' };
  const isSksCommand = tokens[0] === 'sks';
  const [spawnCommand, spawnArgs] = isSksCommand
    ? [process.execPath, [resolveSksEntrypoint(root), ...tokens.slice(1)]]
    : [tokens[0] ?? '', tokens.slice(1)];
  const spawnResult = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: FIXTURE_COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 20,
    env: spawnEnv
  });
  const timedOut = (spawnResult.error as any)?.code === 'ETIMEDOUT';
  const exitOk = !timedOut && spawnResult.status === 0;

  const artifacts = kind === 'execute_and_validate_artifacts'
    ? expected.map((artifact: any) => inspectArtifact(root, artifact))
    : [];
  const artifactFailures = artifacts.filter((artifact: any) => !artifact.ok).map((artifact: any) => `${id}:${artifact.path}:${artifact.failure || 'artifact_invalid'}`);

  const blockers: string[] = [];
  if (!exitOk) blockers.push(timedOut ? `${id}:command_timeout_${FIXTURE_COMMAND_TIMEOUT_MS}` : `${id}:command_exit_${spawnResult.status}`);
  blockers.push(...artifactFailures);

  const ok = blockers.length === 0;
  const actualStatus = ok ? 'pass' : 'blocked';
  if (claimedStatus && claimedStatus !== actualStatus) {
    blockers.push(`${id}:fixture_status_claim_mismatch:claimed=${claimedStatus}:actual=${actualStatus}`);
  }

  return {
    id,
    kind,
    executed: true,
    skipped: false,
    command: fixture.command,
    args: tokens.slice(1),
    exit_code: spawnResult.status,
    signal: spawnResult.signal || null,
    timed_out: timedOut,
    claimed_status: claimedStatus,
    actual_status: actualStatus,
    ok: ok && claimedStatus === actualStatus,
    stdout_bytes: Buffer.byteLength(spawnResult.stdout || ''),
    stderr_bytes: Buffer.byteLength(spawnResult.stderr || ''),
    stderr_tail: String(spawnResult.stderr || '').slice(-800),
    artifacts,
    blockers
  };
}

function inspectArtifact(root: string, artifact: { path: string; schema: string | null; optional?: boolean }) {
  const file = resolveExpectedArtifactPath(root, artifact.path, {});
  const exists = fs.existsSync(file);
  const relPath = path.isAbsolute(artifact.path) ? artifact.path : artifact.path;
  if (!exists) {
    return { path: relPath, schema: artifact.schema, exists: false, ok: Boolean(artifact.optional), failure: artifact.optional ? undefined : 'missing' };
  }
  if (!file.endsWith('.json')) {
    const content = fs.readFileSync(file, 'utf8');
    return { path: relPath, schema: artifact.schema, exists: true, ok: content.trim().length > 0, failure: content.trim().length ? undefined : 'empty' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { path: relPath, schema: artifact.schema, exists: true, ok: false, failure: 'json_parse' };
  }
  if (!artifact.schema) return { path: relPath, schema: null, exists: true, ok: true };
  const schemaOk = parsed.schema === artifact.schema || parsed.schema_version != null;
  return { path: relPath, schema: artifact.schema, exists: true, ok: schemaOk, failure: schemaOk ? undefined : 'schema_mismatch', actual_schema: parsed.schema || null };
}

function normalizeExpectedArtifacts(items: any[] = []): Array<{ path: string; schema: string | null; optional?: boolean }> {
  return (items || []).map((artifact: any) => {
    if (typeof artifact === 'string') return { path: artifact, schema: inferSchema(artifact) };
    return { path: artifact.path, schema: artifact.schema || inferSchema(artifact.path), optional: Boolean(artifact.optional) };
  });
}

function inferSchema(file: string = ''): string | null {
  if (file.includes('completion-proof')) return 'sks.completion-proof.v1';
  if (file.includes('image-voxel-ledger')) return 'sks.image-voxel-ledger.v1';
  if (file.includes('visual-anchors')) return 'sks.visual-anchors.v1';
  return null;
}

function resolveSksEntrypoint(root: string): string {
  const candidates: string[] = [
    path.join(root, 'dist', 'bin', 'sks.js'),
    path.resolve('dist', 'bin', 'sks.js')
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? candidates[0] ?? path.resolve('dist', 'bin', 'sks.js');
}

/**
 * Minimal, defensive command-line tokenizer: splits on whitespace while respecting
 * single and double quotes. Never passed to a shell — used purely to build a spawnSync
 * argv array, so shell metacharacters inside tokens are inert.
 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let hasToken = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i] ?? '';
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) tokens.push(current);
  return tokens;
}
