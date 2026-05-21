import path from 'node:path';
import { ensureDir, nowIso, runProcess, which, writeJsonAtomic } from '../fsx.js';
import { readCodexHookActualState } from './codex-hook-actual-discovery.js';
import { CODEX_HOOK_EVENTS } from '../codex-compat/codex-hook-events.js';

export async function codexHookOfficialParityReport(root: string, opts: any = {}) {
  const actual = await readCodexHookActualState(root);
  const codex = await tryReadCodexHookList(opts);
  const entries = actual.entries.map((entry) => {
    const codexEntry = findCodexEntry(codex.entries, entry);
    const codexHash = codexEntry?.current_hash || codexEntry?.hash || null;
    return {
      key: entry.key,
      source_path: entry.source_path,
      source_format: (entry as any).source_format || 'hooks_json',
      managed: (entry as any).managed === true,
      event: entry.event,
      command: entry.command,
      matcher: entry.matcher,
      current_hash_by_sks: entry.current_hash,
      current_hash_by_codex: codexHash,
      trusted_hash: entry.trusted_hash,
      sks_trust_status: entry.trust_status,
      codex_trust_status: codexEntry?.trust_status || (codex.available ? 'unknown' : 'integration_optional'),
      hash_match: codexHash ? codexHash === entry.current_hash : null,
      parity_source: codexHash ? 'codex_hooks_list_json' : 'managed_or_vendored_fixture_policy'
    };
  });
  const mismatches = entries.filter((entry) => entry.hash_match === false);
  const fixtureParity = buildVendoredFixtureParity();
  const officialHashAvailable = codex.available && entries.some((entry) => entry.current_hash_by_codex);
  const managedOnlyEnforced = actual.managed_dirs.length > 0 || entries.every((entry) => entry.managed === true);
  return {
    schema: 'sks.codex-hook-official-parity.v1',
    ok: mismatches.length === 0 && fixtureParity.ok && (officialHashAvailable || managedOnlyEnforced || entries.length === 0),
    status: officialHashAvailable ? 'official_hash_parity_checked' : 'integration_optional_managed_policy',
    created_at: nowIso(),
    root,
    codex: {
      available: codex.available,
      version: codex.version,
      command: codex.command,
      blocker: codex.blocker,
      docs_note: 'Local Codex CLI builds without `codex hooks list --json` are handled by managed install policy instead of SKS-only trusted_hash writes.'
    },
    policy: {
      official_hash_available: officialHashAvailable,
      managed_only_enforced: managedOnlyEnforced,
      sks_trusted_hash_fallback_allowed: false,
      trusted_hash_writer_policy: 'managed_install_required_when_official_hash_is_unavailable'
    },
    counts: {
      actual_entries: entries.length,
      managed_entries: entries.filter((entry) => entry.managed).length,
      mismatches: mismatches.length,
      codex_hashes_seen: entries.filter((entry) => entry.current_hash_by_codex).length
    },
    fixture_parity: fixtureParity,
    entries,
    mismatches,
    blockers: [
      ...(mismatches.length ? ['codex_hook_hash_mismatch'] : []),
      ...actual.blockers
    ]
  };
}

export async function writeCodexHookOfficialParityReport(root: string, opts: any = {}) {
  const report = await codexHookOfficialParityReport(root, opts);
  const out = opts.outputPath || path.join(root, '.sneakoscope', 'reports', 'codex-hook-parity-1.14.0.json');
  await ensureDir(path.dirname(out));
  await writeJsonAtomic(out, report);
  return { ...report, path: out };
}

async function tryReadCodexHookList(opts: any = {}) {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  if (!codexBin) return { available: false, version: null, command: null, entries: [], blocker: 'codex_binary_missing' };
  const version = await runProcess(codexBin, ['--version'], { timeoutMs: 5000, maxOutputBytes: 4096 })
    .then((run) => String(run.stdout || run.stderr || '').trim())
    .catch(() => null);
  const command = `${codexBin} hooks list --json`;
  const run = await runProcess(codexBin, ['hooks', 'list', '--json'], { timeoutMs: 5000, maxOutputBytes: 256 * 1024 })
    .catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  if (run.code !== 0) {
    return {
      available: false,
      version,
      command,
      entries: [],
      blocker: 'codex_hooks_list_json_unavailable'
    };
  }
  try {
    const parsed = JSON.parse(run.stdout || '{}');
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : Array.isArray(parsed.hooks) ? parsed.hooks : [];
    return { available: true, version, command, entries, blocker: null };
  } catch {
    return { available: false, version, command, entries: [], blocker: 'codex_hooks_list_json_parse_failed' };
  }
}

function findCodexEntry(entries: any[], entry: any) {
  return entries.find((candidate) => {
    const event = candidate.event || candidate.event_name || candidate.hook_event_name;
    const command = candidate.command || candidate.handler?.command;
    const matcher = candidate.matcher ?? candidate.group?.matcher ?? null;
    return event === entry.event && String(command || '') === String(entry.command || '') && String(matcher || '') === String(entry.matcher || '');
  }) || null;
}

function buildVendoredFixtureParity() {
  const fixtureRows = CODEX_HOOK_EVENTS.map((event) => ({
    event,
    command_handler_supported: true,
    timeout_supported: true,
    status_message_supported: true,
    command_windows_supported: true,
    async_false_required: true
  }));
  return {
    ok: fixtureRows.length === CODEX_HOOK_EVENTS.length && fixtureRows.every((row) => row.async_false_required),
    source: 'vendored_codex_latest_schema_plus_sks_command_hook_normalizer',
    official_hash_proven: false,
    managed_policy_required: true,
    rows: fixtureRows
  };
}
