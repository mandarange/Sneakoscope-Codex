import {
  COMMAND_ALIASES,
  COMMANDS,
  type CommandName,
} from './command-registry.js';
import { detectGlobalMode, glmWithoutMadResult } from './global-mode-router.js';
import { ensureCurrentMigrationBeforeCommand } from '../core/update/update-migration-state.js';

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
  const migrationGate = await ensureCurrentMigrationBeforeCommand({ command, args: rest });
  if (!migrationGate.ok) {
    console.error('SKS project migration blocked.');
    for (const blocker of migrationGate.blockers) console.error(`Required blocker: ${blocker}`);
    for (const warning of migrationGate.warnings) console.error(`Optional warning: ${warning}`);
    console.error(`Receipt: ${migrationGate.receipt_path}`);
    console.error('Run: sks doctor --fix --yes');
    process.exitCode = 1;
    return migrationGate;
  }
  const mod = await entry.lazy();
  if (typeof mod.run !== 'function') throw new Error(`Command ${command} must export run(command, args)`);
  return mod.run(rawCommand || command, rest);
}
