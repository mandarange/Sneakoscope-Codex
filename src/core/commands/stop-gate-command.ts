import { sksRoot } from '../fsx.js';
import { checkStopGate } from '../stop-gate/stop-gate-check.js';
import type { StopGateCheckResult } from '../stop-gate/stop-gate-types.js';

export async function stopGateCommand(command: string, args: string[]): Promise<StopGateCheckResult> {
  const subcommand = args[0] === 'check' ? 'check' : (args[0] || 'check');
  const rest = subcommand === 'check' ? args.slice(1) : args;

  const json = rest.includes('--json');
  const route = readOption(rest, '--route');
  const missionId = readOption(rest, '--mission');
  const gatePath = readOption(rest, '--gate');

  if (subcommand !== 'check') {
    const result = {
      schema: 'sks.stop-gate-command.v1',
      ok: false,
      action: 'continue',
      error: `Unknown subcommand: ${subcommand}. Available: check`,
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.error(`Unknown stop-gate subcommand: ${subcommand}. Use: sks stop-gate check --route Naruto --json`);
    return result as unknown as StopGateCheckResult;
  }

  const root = await sksRoot();
  const result = await checkStopGate({
    root,
    ...(route ? { route } : {}),
    ...(missionId ? { missionId } : {}),
    ...(gatePath ? { explicitGatePath: gatePath } : {}),
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.action === 'allow_stop') {
      console.log(`stop-gate: allow_stop — gate passed at ${result.gate_path}`);
    } else if (result.action === 'hard_blocked') {
      console.log(`stop-gate: hard_blocked — ${result.feedback}`);
    } else {
      console.error(`stop-gate: continue — ${result.feedback}`);
    }
    if (result.diagnostics.checked_paths.length > 0) {
      console.log('Checked paths:');
      for (const p of result.diagnostics.checked_paths) console.log(`  ${p}`);
    }
    if (result.diagnostics.selected_gate_path) {
      console.log(`Selected gate: ${result.diagnostics.selected_gate_path}`);
    }
  }
  if (result.action !== 'allow_stop') process.exitCode = 1;
  return result;
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}
