import path from 'node:path';
import { exists, nowIso, readJson, runProcess, which } from '../fsx.js';
import { type CodexHookEventName } from '../codex-compat/codex-hook-events.js';
import { codexCommandHookCurrentHash, type CodexCommandHookIdentity } from './codex-hook-hash.js';

export const CODEX_HOOK_HASH_ORACLE_SCHEMA = 'sks.codex-hook-hash-oracle.v1';
export type CodexHookHashOracleMode = 'cli' | 'rust-helper' | 'golden-fixture' | 'unavailable';

export interface CodexHookHashOracleResult {
  schema: typeof CODEX_HOOK_HASH_ORACLE_SCHEMA;
  ok: boolean;
  mode: CodexHookHashOracleMode;
  event_name: CodexHookEventName | null;
  official_hash_available: boolean;
  official_hash_proven: boolean;
  official_hash: string | null;
  sks_computed_hash: string | null;
  source: string | null;
  blocker: string | null;
  generated_at: string;
}

export async function resolveCodexHookHashOracle(root: string, identity: CodexCommandHookIdentity, opts: any = {}): Promise<CodexHookHashOracleResult> {
  const sksHash = codexCommandHookCurrentHash(identity);
  const cli = await readCliOracle(identity, opts).catch((err: unknown) => unavailable(identity, sksHash, `cli_oracle_failed:${errorMessage(err)}`));
  if (cli.mode === 'cli' && cli.official_hash_available) return cli;
  const rust = await readRustOracle(root, identity, opts).catch((err: unknown) => unavailable(identity, sksHash, `rust_oracle_failed:${errorMessage(err)}`));
  if (rust.mode === 'rust-helper' && rust.official_hash_available) return rust;
  const fixture = await readGoldenFixtureOracle(root, identity, opts).catch((err: unknown) => unavailable(identity, sksHash, `golden_fixture_failed:${errorMessage(err)}`));
  if (fixture.mode === 'golden-fixture' && fixture.official_hash_available) return fixture;
  return unavailable(identity, sksHash, cli.blocker || rust.blocker || fixture.blocker || 'official_hash_oracle_unavailable');
}

async function readCliOracle(identity: CodexCommandHookIdentity, opts: any = {}): Promise<CodexHookHashOracleResult> {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  const sksHash = codexCommandHookCurrentHash(identity);
  if (!codexBin) return unavailable(identity, sksHash, 'codex_binary_missing');
  const run = await runProcess(codexBin, ['hooks', 'hash', '--json'], {
    input: `${JSON.stringify(identity)}\n`,
    timeoutMs: 5000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: errorMessage(err) }));
  if (run.code !== 0) return unavailable(identity, sksHash, 'codex_hooks_hash_json_unavailable');
  const parsed = JSON.parse(run.stdout || '{}');
  const officialHash = parsed.official_hash || parsed.hash || parsed.current_hash || null;
  return oracleResult('cli', identity, sksHash, officialHash, `${codexBin} hooks hash --json`);
}

async function readRustOracle(root: string, identity: CodexCommandHookIdentity, opts: any = {}): Promise<CodexHookHashOracleResult> {
  const sksRs = opts.rustHelper || await which('sks-rs').catch(() => null);
  const sksHash = codexCommandHookCurrentHash(identity);
  if (!sksRs) return unavailable(identity, sksHash, 'rust_helper_missing');
  const run = await runProcess(sksRs, ['codex-hook-hash', '--json'], {
    cwd: root,
    input: `${JSON.stringify(identity)}\n`,
    timeoutMs: 5000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: errorMessage(err) }));
  if (run.code !== 0) return unavailable(identity, sksHash, 'rust_helper_hash_unavailable');
  const parsed = JSON.parse(run.stdout || '{}');
  const officialHash = parsed.official_hash || parsed.hash || null;
  return oracleResult('rust-helper', identity, sksHash, officialHash, `${sksRs} codex-hook-hash --json`);
}

async function readGoldenFixtureOracle(root: string, identity: CodexCommandHookIdentity, opts: any = {}): Promise<CodexHookHashOracleResult> {
  const fixturePath = opts.fixturePath || path.join(root, 'test', 'fixtures', 'codex-hooks', 'official-hash-oracle.json');
  const sksHash = codexCommandHookCurrentHash(identity);
  if (!(await exists(fixturePath))) return unavailable(identity, sksHash, 'golden_fixture_missing');
  const fixture = await readJson<any>(fixturePath, {});
  const rows = Array.isArray(fixture?.entries) ? fixture.entries : [];
  const match = rows.find((row: any) => row.event_name === identity.event && String(row.command || '') === String(identity.command || '') && String(row.matcher || '') === String(identity.matcher || ''));
  const officialHash = match?.official_hash || match?.hash || null;
  return oracleResult('golden-fixture', identity, sksHash, officialHash, fixturePath);
}

function oracleResult(mode: CodexHookHashOracleMode, identity: CodexCommandHookIdentity, sksHash: string, officialHash: string | null, source: string): CodexHookHashOracleResult {
  return {
    schema: CODEX_HOOK_HASH_ORACLE_SCHEMA,
    ok: Boolean(officialHash) && officialHash === sksHash,
    mode,
    event_name: identity.event,
    official_hash_available: Boolean(officialHash),
    official_hash_proven: Boolean(officialHash) && officialHash === sksHash,
    official_hash: officialHash,
    sks_computed_hash: sksHash,
    source,
    blocker: officialHash ? (officialHash === sksHash ? null : 'official_hash_mismatch') : 'official_hash_missing',
    generated_at: nowIso()
  };
}

function unavailable(identity: CodexCommandHookIdentity, sksHash: string, blocker: string): CodexHookHashOracleResult {
  return {
    schema: CODEX_HOOK_HASH_ORACLE_SCHEMA,
    ok: true,
    mode: 'unavailable',
    event_name: identity.event || null,
    official_hash_available: false,
    official_hash_proven: false,
    official_hash: null,
    sks_computed_hash: sksHash,
    source: null,
    blocker,
    generated_at: nowIso()
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
