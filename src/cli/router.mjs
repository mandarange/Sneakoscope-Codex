import { COMMAND_ALIASES, COMMANDS } from './command-registry.mjs';

function normalizeCommand(args = []) {
  const cmd = args[0];
  if (!cmd) return { command: null, args };
  const mapped = COMMAND_ALIASES[cmd] || cmd;
  return {
    command: mapped,
    args: mapped === cmd ? args.slice(1) : args.slice(1)
  };
}

export async function dispatch(args = []) {
  const { command, args: rest } = normalizeCommand(args);
  if (!command) {
    const legacy = await import('./legacy-main.mjs');
    return legacy.main(args);
  }
  const entry = COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }
  const mod = await entry.lazy();
  const runner = mod.run || mod.main || mod.default;
  if (typeof runner !== 'function') throw new Error(`Command ${command} has no run/main export`);
  if (mod.IS_LEGACY_CLI) return runner([command, ...rest]);
  return runner(command, rest);
}
