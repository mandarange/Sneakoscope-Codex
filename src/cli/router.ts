import {
  COMMAND_ALIASES,
  COMMANDS,
  type CommandName,
} from './command-registry.js';
import { detectGlobalMode, glmWithoutMadResult } from './global-mode-router.js';
import { ensureCurrentMigrationBeforeCommand } from '../core/update/update-migration-state.js';
import { projectRoot, readJson } from '../core/fsx.js';
import { stateFile } from '../core/mission.js';

export interface NormalizedCommand {
  command: CommandName | null;
  rawCommand: string | null;
  aliasTarget: CommandName | null;
  args: string[];
}

export interface UnknownCommandResult {
  ok: false;
  status: 'blocked';
  command: string;
  reason: 'unknown_command';
}

export function isCommandName(value: string): value is CommandName {
  return Object.prototype.hasOwnProperty.call(COMMANDS, value);
}

export function normalizeCommand(args: readonly string[] = []): NormalizedCommand {
  const cmd = args[0];
  if (!cmd) return { command: null, rawCommand: null, aliasTarget: null, args: [...args] };
  const mapped: string =
    cmd in COMMAND_ALIASES ? COMMAND_ALIASES[cmd as keyof typeof COMMAND_ALIASES] : cmd;
  const rest = args.slice(1);
  const command = isCommandName(mapped) ? mapped : null;
  return {
    command,
    rawCommand: cmd,
    aliasTarget: command && mapped !== cmd ? command : null,
    args: rest,
  };
}

export async function dispatch(args?: readonly string[]): Promise<unknown> {
  const argv = args ?? process.argv.slice(2);
  try {
    return await dispatchInner(argv);
  } catch (err: unknown) {
    // Final choke point: any uncaught bug anywhere in the dispatch chain (gate
    // checks, lazy command import, command run()) must never leak a raw stack
    // dump to the user as their "answer" — convert it to a structured, honest
    // failure instead. Every existing explicit error path above already sets
    // process.exitCode and returns normally (never throws), so this only ever
    // catches genuinely unexpected exceptions; it changes nothing about those
    // paths' exit codes or messages.
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
    else process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    const result = { ok: false, error: message, command: normalizeCommand(argv).rawCommand };
    // A --json caller depends on stdout always being exactly one JSON result
    // (this is the same non-interactive contract SKS_AGENT_MODE promises) — an
    // uncaught crash must not leave stdout empty, or a JSON.parse on the
    // consuming end breaks with no diagnosable output at all.
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    return result;
  }
}

async function dispatchInner(argv: readonly string[]): Promise<unknown> {
  const globalMode = detectGlobalMode(argv);
  if (globalMode?.kind === 'mad-glm') {
    const mod = await import('../core/commands/glm-command.js');
    return mod.glmCommand(globalMode.args);
  }
  if (globalMode?.kind === 'glm-without-mad') {
    const result = glmWithoutMadResult();
    console.error(`GLM mode requires MAD: ${result.hint}`);
    process.exitCode = 1;
    return result;
  }
  const { command, rawCommand, args: rest } = normalizeCommand(argv);
  if (!command) {
    if (!argv.length) {
      const mod = await import('../commands/doctor.js');
      return mod.run('doctor', []);
    }
    const raw = argv[0] ?? '';
    console.error(`Unknown command: ${raw}`);
    process.exitCode = 1;
    const result: UnknownCommandResult = {
      ok: false,
      status: 'blocked',
      command: raw,
      reason: 'unknown_command',
    };
    return result;
  }
  const entry = COMMANDS[command];
  const commandGate = await ensureActiveRouteCommandGate(command, rest);
  if (!commandGate.ok) {
    console.error(commandGate.message);
    process.exitCode = 1;
    return commandGate;
  }
  const migrationGate = await ensureCurrentMigrationBeforeCommand({
    command,
    args: rest,
    skipMigrationGate: entry.skipMigrationGate === true || entry.readonly === true
  });
  if (!migrationGate.ok) {
    console.error('SKS project migration blocked.');
    console.error(`Scope: ${migrationGate.scope || 'project'}`);
    console.error(`Stage: ${migrationGate.failed_stage_id || migrationGate.status}`);
    if (migrationGate.failed_stage_id) console.error(`Failed stage: ${migrationGate.failed_stage_id}`);
    for (const blocker of migrationGate.blockers) console.error(`Required blocker: ${blocker}`);
    for (const warning of migrationGate.warnings) console.error(`Optional warning: ${warning}`);
    console.error(`Receipt: ${migrationGate.receipt_path}`);
    console.error('Remedies: run `sks doctor --fix --yes`, then retry; diagnostics that must bypass this gate are marked skipMigrationGate in the command registry.');
    process.exitCode = 1;
    return migrationGate;
  }
  const mod = await entry.lazy();
  if (typeof mod.run !== 'function') throw new Error(`Command ${command} must export run(command, args)`);
  return mod.run(rawCommand || command, rest);
}

async function ensureActiveRouteCommandGate(command: CommandName, args: readonly string[]) {
  const entry = COMMANDS[command];
  if (command === 'route' || entry.readonly === true || entry.allowedDuringActiveRoute === true && entry.mutatesRouteState !== true) {
    return { ok: true, status: 'allowed' };
  }
  if (entry.mutatesRouteState !== true) return { ok: true, status: 'allowed' };
  if (safeReadOnlySubcommand(args)) return { ok: true, status: 'allowed_status_subcommand' };
  if (process.env.SKS_TEST_ISOLATION === '1' && process.env.SKS_RELEASE_FIXTURE_ACTIVE_ROUTE_BYPASS === '1') {
    return { ok: true, status: 'allowed_release_fixture_isolation' };
  }
  const root = await projectRoot(process.cwd()).catch(() => process.cwd());
  const state = await readJson(stateFile(root), {}).catch(() => ({}));
  if (!activeRouteStateBlocksCommand(state)) return { ok: true, status: 'allowed' };
  return {
    schema: 'sks.command-gate-active-route.v1',
    ok: false,
    status: 'blocked',
    command,
    active_mission_id: state.mission_id || null,
    active_route: state.route || state.route_command || state.mode || null,
    active_phase: state.phase || null,
    message: `SKS command gate blocked '${command}' because active route mission ${state.mission_id} is not closed. Run: sks route close --mission ${state.mission_id}`
  };
}

function safeReadOnlySubcommand(args: readonly string[]) {
  const sub = String(args.find((arg) => !String(arg).startsWith('-')) || '').toLowerCase();
  if (!['status', 'show', 'list', 'observe', 'watch', 'doctor', 'help'].includes(sub)) return false;
  return !args.some((arg) => ['--fix', '--yes', '-y', '--write', '--apply', '--execute', '--force', '--real'].includes(String(arg)));
}

function activeRouteStateBlocksCommand(state: any = {}) {
  if (!state?.mission_id || state.route_closed === true) return false;
  const mode = String(state.mode || '').toUpperCase();
  if (!mode || ['WIKI', 'STATUS', 'HELP'].includes(mode)) return false;
  if (/(?:DONE|COMPLETE|CLOSED|BLOCKED|FAILED)$/i.test(String(state.phase || ''))) return false;
  return Boolean(state.route || state.route_command || ['NARUTO', 'AGENT', 'QALOOP', 'RESEARCH', 'LOOP', 'MADSKS', 'MADDB', 'GOAL'].includes(mode));
}
