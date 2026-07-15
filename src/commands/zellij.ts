import path from 'node:path';
import fs from 'node:fs';
import { nowIso, projectRoot, readJson, writeJsonAtomic } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';
import { checkZellijUpdateNotice, upgradeZellijToLatest } from '../core/zellij/zellij-update.js';
import { runZellij } from '../core/zellij/zellij-command.js';
import { appendZellijLaneCommand, normalizeZellijSlot } from '../core/zellij/zellij-lane-runtime.js';
import { buildZellijDashboardSnapshot, renderZellijDashboardText } from '../core/zellij/zellij-dashboard-renderer.js';
import { readZellijSlotTelemetrySnapshot } from '../core/zellij/zellij-slot-telemetry.js';

export const ZELLIJ_COMMAND_SCHEMA = 'sks.zellij-command.v1';
export const ZELLIJ_REPAIR_SCHEMA = 'sks.zellij-repair.v1';

function installHint(): string {
  if (process.platform === 'darwin') return 'brew install zellij';
  if (process.platform === 'linux') return 'cargo install --locked zellij   # or your distro package, e.g. `apt install zellij` / `pacman -S zellij`';
  return 'See https://zellij.dev/documentation/installation';
}

export async function run(_command: string = 'zellij', args: string[] = []) {
  const sub = (args.find((arg) => !arg.startsWith('-')) || 'status').toLowerCase();
  const json = flag(args, '--json');
  const root = await projectRoot();
  if (sub === 'help') return printHelp(json);
  if (sub === 'update' || sub === 'upgrade') return zellijUpdate(args, json);
  if (sub === 'repair') return zellijRepair(root, args, json);
  if (sub === 'dispatch' || sub === 'send') return zellijDispatch(root, args, json);
  if (sub === 'focus-worker') return zellijFocusWorker(root, args, json);
  if (sub === 'worker-logs') return zellijWorkerLogs(root, args, json);
  if (sub === 'dashboard') return zellijDashboard(root, args, json);
  if (sub === 'close-drained') return zellijCloseDrained(root, args, json);
  if (sub === 'pin' || sub === 'unpin') return zellijViewportPin(root, sub, args, json);
  return zellijStatus(root, args, json);
}

async function zellijStatus(root: string, args: string[], json: boolean) {
  const requireReal = flag(args, '--require-real') || process.env.SKS_REQUIRE_ZELLIJ === '1';
  const capability = await checkZellijCapability({ root, require: requireReal });
  const status = capability.status || 'unknown';
  const ready = status === 'ok';
  const result = {
    schema: ZELLIJ_COMMAND_SCHEMA,
    subcommand: 'status',
    ok: ready || !requireReal,
    status,
    version: capability.version || null,
    required_for: ['sks --mad', 'interactive MAD lane UI', 'standalone Zellij diagnostics'],
    blockers: capability.blockers || [],
    warnings: capability.warnings || [],
    install_hint: ready ? null : installHint(),
    next_actions: ready
      ? []
      : [`Install Zellij: ${installHint()}`, 'Then re-run `sks zellij status` and `sks doctor --fix`.']
  };
  if (json) {
    printJson(result);
  } else {
    console.log('SKS Zellij runtime');
    console.log(`  status:   ${status}${result.version ? ` (${result.version})` : ''}`);
    console.log(`  required: ${result.required_for.join(', ')}`);
    if (result.blockers.length) console.log(`  blockers: ${result.blockers.join(', ')}`);
    if (!ready) {
      console.log('  next:');
      for (const action of result.next_actions) console.log(`    - ${action}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

async function zellijUpdate(args: string[], json: boolean) {
  const apply = flag(args, '--yes') || flag(args, '-y') || flag(args, '--apply');
  const notice = await checkZellijUpdateNotice({});
  if (!apply || !notice.update_available) {
    const result = {
      schema: 'sks.zellij-update-command.v1',
      subcommand: 'update',
      ok: !notice.error,
      mode: apply ? 'apply' : 'check',
      current_version: notice.current_version,
      latest_version: notice.latest_version,
      update_available: notice.update_available,
      zellij_missing: notice.zellij_missing,
      source: notice.source,
      upgrade_command: notice.upgrade_command,
      message: notice.message,
      next_actions: notice.update_available ? ['Apply with: sks zellij update --yes'] : [],
      error: notice.error || null
    };
    if (json) printJson(result);
    else {
      console.log(notice.message);
      if (notice.update_available) console.log('Apply with: sks zellij update --yes');
    }
    if (notice.error && !notice.latest_version) process.exitCode = 1;
    return;
  }
  const upgraded = await upgradeZellijToLatest({});
  const result = {
    schema: 'sks.zellij-update-command.v1',
    subcommand: 'update',
    ok: upgraded.status === 'upgraded' || upgraded.status === 'installed' || upgraded.status === 'noop',
    mode: 'apply',
    status: upgraded.status,
    before_version: upgraded.before_version,
    after_version: upgraded.after_version,
    latest_version: upgraded.latest_version,
    command: upgraded.command,
    error: upgraded.error || null
  };
  if (json) printJson(result);
  else if (result.ok) console.log(`Zellij ${upgraded.before_version || 'unknown'} -> ${upgraded.after_version || upgraded.latest_version || 'latest'} (${upgraded.command})`);
  else console.log(`Zellij update ${upgraded.status}: ${upgraded.error || upgraded.command}`);
  if (!result.ok) process.exitCode = 1;
}

async function zellijFocusWorker(root: string, args: string[], json: boolean) {
  const missionId = resolveMissionId(root, readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest');
  const slotId = normalizeZellijSlot(readOption(args, '--slot', positionalAfter(args, 'focus-worker') || 'slot-001'));
  const state = await readJson<any>(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-right-column-state.json'), null);
  const worker = state?.visible_worker_panes?.find?.((row: any) => normalizeZellijSlot(row.slot_id) === slotId && row.pane_id);
  const result = worker?.pane_id
    ? await runZellij(['--session', state.session_name, 'action', 'focus-pane-id', String(worker.pane_id)], { cwd: root, timeoutMs: 5000, optional: true })
    : null;
  const out = {
    schema: 'sks.zellij-focus-worker.v1',
    ok: Boolean(worker?.pane_id) && (result?.ok !== false),
    mission_id: missionId,
    slot_id: slotId,
    pane_id: worker?.pane_id || null,
    session_name: state?.session_name || null,
    result,
    blockers: worker?.pane_id ? (result && !result.ok ? result.blockers : []) : ['worker_pane_not_found']
  };
  if (json) printJson(out);
  else console.log(out.ok ? `Focused ${slotId} (${out.pane_id})` : `Worker pane not found: ${slotId}`);
  if (!out.ok) process.exitCode = 1;
}

async function zellijWorkerLogs(root: string, args: string[], json: boolean) {
  const missionId = resolveMissionId(root, readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest');
  const slotArg = positionalAfter(args, 'worker-logs') || readOption(args, '--slot', '');
  const slotId = slotArg ? normalizeZellijSlot(slotArg) : null;
  const runtime = await readJson<any>(path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'native-cli-worker-runtime.json'), null);
  const records = Array.isArray(runtime?.records) ? runtime.records : [];
  const filtered = slotId ? records.filter((row: any) => normalizeZellijSlot(row.slot_id) === slotId) : records;
  const out = {
    schema: 'sks.zellij-worker-logs.v1',
    ok: filtered.length > 0,
    mission_id: missionId,
    slot_id: slotId,
    logs: filtered.map((row: any) => ({
      slot_id: row.slot_id,
      generation_index: row.generation_index,
      status: row.status,
      stdout_log: row.stdout_log ? path.join(root, '.sneakoscope', 'missions', missionId, 'agents', row.stdout_log) : null,
      stderr_log: row.stderr_log ? path.join(root, '.sneakoscope', 'missions', missionId, 'agents', row.stderr_log) : null,
      worker_artifact_dir: row.worker_artifact_dir
    })),
    blockers: filtered.length ? [] : ['worker_log_records_missing']
  };
  if (json) printJson(out);
  else for (const log of out.logs) console.log(`${log.slot_id} gen-${log.generation_index} ${log.status}\nstdout: ${log.stdout_log}\nstderr: ${log.stderr_log}`);
  if (!out.ok) process.exitCode = 1;
}

async function zellijDashboard(root: string, args: string[], json: boolean) {
  const missionId = resolveMissionId(root, readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest');
  const snapshot = await readJson<any>(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-dashboard-snapshot.json'), null);
  const state = await readJson<any>(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-right-column-state.json'), null);
  const watch = flag(args, '--watch');
  const out = {
    schema: 'sks.zellij-dashboard-command.v1',
    ok: Boolean(snapshot || state),
    mission_id: missionId,
    snapshot,
    right_column_state: state,
    watch,
    watch_command: `sks zellij dashboard --mission ${missionId} --watch`
  };
  if (json) printJson(out);
  else if (snapshot) console.log(renderZellijDashboardText(buildZellijDashboardSnapshot({ ...snapshot, mission_id: snapshot.mission_id || missionId })));
  else console.log(JSON.stringify(state || out, null, 2));
  if (!out.ok) process.exitCode = 1;
}

async function zellijCloseDrained(root: string, args: string[], json: boolean) {
  const missionId = resolveMissionId(root, readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest');
  const state = await readJson<any>(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-right-column-state.json'), null);
  const rows = Array.isArray(state?.visible_worker_panes) ? state.visible_worker_panes.filter((row: any) => row.pane_id && (row.status === 'draining' || row.status === 'closed')) : [];
  const results = [];
  for (const row of rows) {
    results.push(await runZellij(['--session', state.session_name, 'action', 'close-pane', '--pane-id', String(row.pane_id)], { cwd: root, timeoutMs: 5000, optional: true }));
  }
  const out = {
    schema: 'sks.zellij-close-drained.v1',
    ok: results.every((result) => result.ok !== false),
    mission_id: missionId,
    closed_count: results.filter((result) => result.ok).length,
    attempted_count: results.length,
    results,
    blockers: results.flatMap((result) => result.ok ? [] : result.blockers)
  };
  if (json) printJson(out);
  else console.log(`Closed drained panes: ${out.closed_count}/${out.attempted_count}`);
  if (!out.ok) process.exitCode = 1;
}

async function zellijViewportPin(root: string, action: 'pin' | 'unpin', args: string[], json: boolean) {
  const missionId = resolveMissionId(root, readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest');
  const slotArg = positionalAfter(args, action) || readOption(args, '--slot', '');
  const viewport = Math.max(1, Number(readOption(args, '--viewport', '1')) || 1);
  const file = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij', 'viewport-pins.json');
  const cur = await readJson<{ pins: Array<{ viewport: number; slot_key: string }> }>(file, { pins: [] });
  const slotKey = slotArg ? await resolveLatestGenKey(root, missionId, slotArg) : '';
  const pins = (cur.pins || []).filter((pin) => pin.viewport !== viewport && (!slotKey || pin.slot_key !== slotKey));
  const blockers = slotArg ? [] : ['slot_required'];
  if (action === 'pin' && slotKey && blockers.length === 0) pins.push({ viewport, slot_key: slotKey });
  await writeJsonAtomic(file, {
    schema: 'sks.zellij-viewport-pins.v1',
    updated_at: nowIso(),
    pins
  });
  const out = {
    schema: 'sks.zellij-viewport-pin-command.v1',
    ok: blockers.length === 0,
    action,
    mission_id: missionId,
    viewport,
    slot_key: slotKey || null,
    pins,
    blockers
  };
  if (json) printJson(out);
  else if (out.ok) console.log(action === 'pin' ? `pinned ${slotKey} -> viewport ${viewport}` : `unpinned ${slotKey}`);
  else console.log('Usage: sks zellij pin <slot> [--viewport N] [--mission M]');
  if (!out.ok) process.exitCode = 1;
}

async function zellijDispatch(root: string, args: string[], json: boolean) {
  const missionId = readOption(args, '--mission', readOption(args, '--mission-id', 'latest') || 'latest') || 'latest';
  const slotId = normalizeZellijSlot(readOption(args, '--slot', 'slot-001'));
  const text = readOption(args, '--text', readOption(args, '--message', '')) || '';
  const ledgerRoot = path.resolve(readOption(args, '--ledger-root', defaultLedgerRoot(root, missionId)) || defaultLedgerRoot(root, missionId));
  const supervisor = await readJson<any>(path.join(ledgerRoot, 'agent-zellij-lane-supervisor.json'), null);
  const lane = Array.isArray(supervisor?.lanes)
    ? supervisor.lanes.find((row: any) => normalizeZellijSlot(row?.slot_id) === slotId)
    : null;
  const command = await appendZellijLaneCommand(ledgerRoot, {
    missionId,
    slotId,
    kind: 'operator_text',
    payload: { text },
    source: 'sks_zellij_dispatch'
  });
  const shouldWritePane = flag(args, '--write-pane');
  const paneId = lane?.pane_id ? String(lane.pane_id) : '';
  const canWritePane = shouldWritePane && paneId && !/^zellij-pane-/.test(paneId);
  const sessionName = String(supervisor?.session_name || `sks-${missionId}`);
  const paneWrite = canWritePane
    ? await runZellij(['--session', sessionName, 'action', 'write-chars', `${text}\n`, '--pane-id', paneId], { cwd: root, timeoutMs: 5000, optional: true })
    : null;
  const result = {
    schema: 'sks.zellij-dispatch.v1',
    ok: !shouldWritePane || paneWrite?.ok === true || !canWritePane,
    mission_id: missionId,
    slot_id: slotId,
    ledger_root: ledgerRoot,
    transport: 'jsonl_nonblocking',
    command_inbox: path.join('lanes', slotId, 'command-inbox.jsonl'),
    command,
    pane_id: paneId || null,
    pane_id_source: lane?.pane_id_source || null,
    pane_write_requested: shouldWritePane,
    pane_write_attempted: canWritePane,
    pane_write: paneWrite,
    warnings: [
      ...(text ? [] : ['zellij_dispatch_empty_text']),
      ...(shouldWritePane && !canWritePane ? ['zellij_dispatch_pane_write_skipped_until_real_pane_id_reconciled'] : [])
    ],
    blockers: paneWrite && !paneWrite.ok ? paneWrite.blockers : []
  };
  if (json) printJson(result);
  else {
    console.log(`Queued Zellij lane command for ${slotId}: ${result.command_inbox}`);
    if (result.warnings.length) console.log(`Warnings: ${result.warnings.join(', ')}`);
    if (result.blockers.length) console.log(`Blockers: ${result.blockers.join(', ')}`);
  }
  if (!result.ok) process.exitCode = 1;
}

async function zellijRepair(root: string, args: string[], json: boolean) {
  // Explain-only by default: SKS never auto-installs Zellij (no Homebrew/cargo
  // side-effects from this command). It surfaces the exact operator steps.
  const capability = await checkZellijCapability({ root, require: false });
  const status = capability.status || 'unknown';
  const autoInstall = false;
  const result = {
    schema: ZELLIJ_REPAIR_SCHEMA,
    subcommand: 'repair',
    ok: true,
    mode: 'explain',
    status,
    auto_install: autoInstall,
    operator_actions: [
      `Install or upgrade Zellij: ${installHint()}`,
      'Verify: `sks zellij status` (or `npm run zellij:capability`).',
      'Opt-in dependency repair through SKS: `sks deps check --yes` or `sks bootstrap --yes`.',
      'Recover Codex config issues: `sks doctor --fix`.'
    ]
  };
  if (json) {
    printJson(result);
  } else {
    console.log('SKS Zellij repair (explain-only; no automatic install)');
    console.log(`  current status: ${status}`);
    for (const action of result.operator_actions) console.log(`  - ${action}`);
  }
}

function printHelp(json: boolean) {
  const result = {
    schema: ZELLIJ_COMMAND_SCHEMA,
    subcommand: 'help',
    ok: true,
    usage: 'sks zellij status|update|repair|dispatch|send|focus-worker|worker-logs|dashboard|pin|unpin|close-drained [--json]',
    subcommands: {
      status: 'Report Zellij runtime capability and interactive-route readiness.',
      update: 'Check the latest stable Zellij release; apply the upgrade with --yes (Homebrew).',
      repair: 'Explain how to install/repair Zellij (no automatic install).',
      dispatch: 'Append a nonblocking JSONL command for a lane; optionally write to a reconciled pane id with --write-pane.',
      send: 'Alias for dispatch.',
      'focus-worker': 'Focus a visible right-column worker pane by slot.',
      'worker-logs': 'Print stdout/stderr log paths for worker slots.',
      dashboard: 'Render the latest dashboard snapshot; --watch prints watch metadata.',
      pin: 'Pin a dynamic worker slot to a viewport.',
      unpin: 'Remove a worker slot pin from a viewport.',
      'close-drained': 'Close drained right-column panes.',
      capability: 'Alias for status.'
    }
  };
  if (json) printJson(result);
  else {
    console.log('sks zellij — inspect and repair the Zellij interactive runtime');
    console.log('  sks zellij status [--require-real] [--json]');
    console.log('  sks zellij update [--yes] [--json]');
    console.log('  sks zellij repair [--explain] [--json]');
    console.log('  sks zellij dispatch --mission M --slot slot-001 --text "..." [--write-pane] [--json]');
    console.log('  sks zellij focus-worker slot-001 [--mission M] [--json]');
    console.log('  sks zellij worker-logs [slot-001] [--mission M] [--json]');
    console.log('  sks zellij dashboard [--mission M] [--watch] [--json]');
    console.log('  sks zellij pin slot-001 [--viewport 2] [--mission M] [--json]');
    console.log('  sks zellij unpin slot-001 [--viewport 2] [--mission M] [--json]');
    console.log('  sks zellij close-drained [--mission M] [--json]');
  }
}

function defaultLedgerRoot(root: string, missionId: string): string {
  if (!missionId || missionId === 'latest') return path.join(root, '.sneakoscope', 'missions', 'latest', 'agents');
  return path.join(root, '.sneakoscope', 'missions', missionId, 'agents');
}

function readOption(args: string[], name: string, fallback: string): string;
function readOption(args: string[], name: string, fallback: string | null): string | null;
function readOption(args: string[], name: string, fallback: string | null): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
}

function positionalAfter(args: string[], subcommand: string): string | null {
  const index = args.indexOf(subcommand);
  for (const arg of args.slice(index >= 0 ? index + 1 : 1)) {
    if (!String(arg).startsWith('-')) return String(arg);
  }
  return null;
}

function resolveMissionId(root: string, requested: string): string {
  if (requested && requested !== 'latest') return requested;
  const dir = path.join(root, '.sneakoscope', 'missions');
  try {
    const rows = fs.readdirSync(dir)
      .filter((name) => /^M-/.test(name))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return rows[0]?.name || 'latest';
  } catch {
    return 'latest';
  }
}

async function resolveLatestGenKey(root: string, missionId: string, rawSlot: string): Promise<string> {
  const raw = String(rawSlot || '').trim()
  if (raw.includes(':g')) return raw
  const slotId = normalizeZellijSlot(raw)
  const snapshot = await readZellijSlotTelemetrySnapshot(root, missionId).catch(() => null)
  const candidates = Object.entries(snapshot?.slots || {})
    .filter(([, row]) => normalizeZellijSlot(row.slot_id) === slotId)
    .sort(([, a], [, b]) => Number(b.generation_index || 1) - Number(a.generation_index || 1))
  return candidates[0]?.[0] || `${slotId}:g1`
}
