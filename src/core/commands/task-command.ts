import { checkCommand } from './check-command.js';

export async function taskCommand(args: string[] = []): Promise<unknown> {
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'run';
  const rest = sub === args[0] ? args.slice(1) : args;
  if (sub === 'run') return checkCommand(['--tier', 'confidence', ...rest]);
  if (sub === 'affected') return checkCommand(['--tier', 'affected', ...rest]);
  if (sub === 'instant') return checkCommand(['--tier', 'instant', ...rest]);
  console.error('Usage: sks task run|affected|instant [--sla 5m] [--json]');
  process.exitCode = 1;
  return null;
}
