import {
  COMMAND_ALIASES,
  COMMANDS,
  type CommandName,
} from './command-registry.js';

export interface NormalizedCommand {
  command: CommandName | null;
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
  if (!cmd) return { command: null, args: [...args] };
  let mapped: string =
    cmd in COMMAND_ALIASES ? COMMAND_ALIASES[cmd as keyof typeof COMMAND_ALIASES] : cmd;
  const rest = args.slice(1);
  return {
    command: isCommandName(mapped) ? mapped : null,
    args: rest,
  };
}

export async function dispatch(args?: readonly string[]): Promise<unknown> {
  const argv = args ?? process.argv.slice(2);
  const { command, args: rest } = normalizeCommand(argv);
  if (!command) {
    if (!argv.length) {
      const mod = await import('../commands/tmux.js');
      return mod.run('tmux', ['check']);
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
  const mod = await entry.lazy();
  if (typeof mod.run !== 'function') throw new Error(`Command ${command} must export run(command, args)`);
  return mod.run(command, rest);
}
