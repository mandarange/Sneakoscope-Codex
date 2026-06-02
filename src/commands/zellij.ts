import path from 'node:path';
import { projectRoot, readJson } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';
import { runZellij } from '../core/zellij/zellij-command.js';
import { appendZellijLaneCommand, normalizeZellijSlot } from '../core/zellij/zellij-lane-runtime.js';

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
  if (sub === 'repair') return zellijRepair(root, args, json);
  if (sub === 'dispatch' || sub === 'send') return zellijDispatch(root, args, json);
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
    required_for: ['sks --mad', 'sks team open-zellij', 'interactive lane UI'],
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
    usage: 'sks zellij status|repair|dispatch|send|capability [--require-real] [--json]',
    subcommands: {
      status: 'Report Zellij runtime capability and interactive-route readiness.',
      repair: 'Explain how to install/repair Zellij (no automatic install).',
      dispatch: 'Append a nonblocking JSONL command for a lane; optionally write to a reconciled pane id with --write-pane.',
      send: 'Alias for dispatch.',
      capability: 'Alias for status.'
    }
  };
  if (json) printJson(result);
  else {
    console.log('sks zellij — inspect and repair the Zellij interactive runtime');
    console.log('  sks zellij status [--require-real] [--json]');
    console.log('  sks zellij repair [--explain] [--json]');
    console.log('  sks zellij dispatch --mission M --slot slot-001 --text "..." [--write-pane] [--json]');
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
