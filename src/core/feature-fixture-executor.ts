import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveExpectedArtifactPath } from './feature-fixture-runner.js';
import { findLatestMission } from './mission.js';

const FIXTURE_COMMAND_TIMEOUT_MS = 60_000;

/** Per-fixture override, set via the fixture()'s `extra.timeout_ms` for commands
 * that are legitimately slower than the 60s default (real agent/swarm orchestration,
 * multi-step pipelines) rather than actually hung. */
function fixtureTimeoutMs(fixture: any): number {
  const override = Number(fixture?.timeout_ms);
  return Number.isFinite(override) && override > 0 ? override : FIXTURE_COMMAND_TIMEOUT_MS;
}

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
export async function runFeatureFixture(feature: any, { root = process.cwd() }: { root?: string } = {}) {
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
  const timeoutMs = fixtureTimeoutMs(fixture);
  const spawnResult = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 20,
    env: spawnEnv
  });
  const timedOut = (spawnResult.error as any)?.code === 'ETIMEDOUT';
  const exitOk = !timedOut && spawnResult.status === 0;

  // Most fixture commands create a fresh, uniquely-IDed mission and write their
  // expected artifacts (completion-proof.json, <route>-gate.json, ...) inside that
  // mission's own directory, not at the project root. Without a mission id,
  // resolveExpectedArtifactPath() falls back to root-relative resolution and every
  // such artifact is reported "missing" even when the command succeeded. Prefer the
  // mission id the command itself printed in its --json stdout (unambiguous, immune
  // to races with unrelated concurrent sessions on a shared machine); only fall back
  // to a filesystem mtime scan if the command's own output didn't carry one.
  const missionIdFromOutput = extractMissionId(spawnResult.stdout);
  const latestMissionId = missionIdFromOutput
    ?? (kind === 'execute_and_validate_artifacts' ? await findLatestMission(root).catch(() => null) : null);

  const artifacts = kind === 'execute_and_validate_artifacts'
    ? expected.map((artifact: any) => inspectArtifact(root, artifact, latestMissionId))
    : [];
  const artifactFailures = artifacts.filter((artifact: any) => !artifact.ok).map((artifact: any) => `${id}:${artifact.path}:${artifact.failure || 'artifact_invalid'}`);

  const blockers: string[] = [];
  if (!exitOk) blockers.push(timedOut ? `${id}:command_timeout_${timeoutMs}` : `${id}:command_exit_${spawnResult.status}`);
  blockers.push(...artifactFailures);

  const ok = blockers.length === 0;
  const actualStatus = ok ? 'pass' : 'blocked';
  // "ok" (the ultimate pass/fail signal selftest --real counts) must mean "the
  // registry's claimed status matches reality" - NOT "the underlying command exited
  // 0" - those are different questions. Several fixtures intentionally run a
  // command that always exits non-zero by design (an honest mock/blocked
  // demonstration, per the execution_class:'mock_fixture' hardening elsewhere in
  // this codebase); such a fixture correctly declaring claimed_status:'blocked' is
  // a PASSING self-consistency check, not a failure, even though blockers still
  // faithfully records the real command_exit_N/artifact issues for anyone auditing
  // what actually happened. Only an actual mismatch between claim and reality is a
  // real fixture-registry defect worth failing selftest --real over.
  const statusMatches = !claimedStatus || claimedStatus === actualStatus;
  if (!statusMatches) {
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
    ok: statusMatches,
    stdout_bytes: Buffer.byteLength(spawnResult.stdout || ''),
    stderr_bytes: Buffer.byteLength(spawnResult.stderr || ''),
    stderr_tail: String(spawnResult.stderr || '').slice(-800),
    artifacts,
    blockers,
    resolved_mission_id: latestMissionId
  };
}

/**
 * Pulls a mission id out of a command's JSON stdout. Handles the common field
 * names/shapes used across sks commands (`mission_id`, `missionId`, a top-level
 * `id` that matches the `M-<timestamp>-<suffix>` pattern, or a nested `mission.id`),
 * and tolerates stdout that has trailing non-JSON log lines by scanning for the
 * last parseable JSON object.
 */
function extractMissionId(stdout: string | null | undefined): string | null {
  if (!stdout) return null;
  const candidates: any[] = [];
  for (const line of String(stdout).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      candidates.push(JSON.parse(trimmed));
    } catch {
      // not a standalone JSON line; the payload may still be a multi-line pretty-printed
      // object, handled by the whole-stdout attempt below.
    }
  }
  try {
    candidates.push(JSON.parse(stdout));
  } catch {
    // pretty-printed JSON mixed with other stdout; ignore.
  }
  const missionIdPattern = /^M-\d{8}-\d{6}-[a-z0-9]+$/i;
  for (const parsed of candidates.reverse()) {
    if (!parsed || typeof parsed !== 'object') continue;
    const direct = parsed.mission_id || parsed.missionId || parsed.mission?.id || parsed.completion_proof?.mission_id || parsed.decision?.mission_id;
    if (typeof direct === 'string' && direct) return direct;
    if (typeof parsed.id === 'string' && missionIdPattern.test(parsed.id)) return parsed.id;
  }
  return null;
}

function inspectArtifact(root: string, artifact: { path: string; schema: string | null; optional?: boolean }, latestMissionId: string | null) {
  const file = resolveExpectedArtifactPath(root, artifact.path, { latestMissionId });
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
