import { projectRoot } from '../core/fsx.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { codexLbMetrics, readCodexLbCircuit, resetCodexLbCircuit } from '../core/codex-lb-circuit.mjs';

export async function run(command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'metrics') {
    const result = codexLbMetrics(await readCodexLbCircuit(root));
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb circuit: ${result.circuit.state}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'doctor' && flag(args, '--deep')) {
    const result = { schema: 'sks.codex-lb-doctor.v1', deep: true, ...codexLbMetrics(await readCodexLbCircuit(root)) };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb deep doctor: ${result.ok ? 'ok' : 'blocked'} (${result.circuit.state})`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'circuit' && args[1] === 'reset') {
    const result = await resetCodexLbCircuit(root);
    if (flag(args, '--json')) return printJson({ ok: true, circuit: result });
    console.log('codex-lb circuit reset');
    return;
  }
  const legacy = await import('../cli/legacy-main.mjs');
  return legacy.main([command, ...args]);
}
