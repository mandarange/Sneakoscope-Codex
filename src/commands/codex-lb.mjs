import path from 'node:path';
import { projectRoot } from '../core/fsx.mjs';
import { flag, readOption } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { codexLbMetrics, readCodexLbCircuit, recordCodexLbHealthEvent, resetCodexLbCircuit } from '../core/codex-lb-circuit.mjs';

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
  if (action === 'circuit' && args[1] === 'record-fixture') {
    const fixturePath = args[2] || readOption(args, '--fixture', null);
    if (!fixturePath) {
      console.error('Usage: sks codex-lb circuit record-fixture <fixture.json> [--json]');
      process.exitCode = 1;
      return;
    }
    const { readJson } = await import('../core/fsx.mjs');
    const event = await readJson(path.isAbsolute(fixturePath) ? fixturePath : path.resolve(root, fixturePath), {});
    const circuit = await recordCodexLbHealthEvent(root, event);
    const result = { schema: 'sks.codex-lb-circuit-record-fixture.v1', ok: true, fixture: fixturePath, circuit };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb circuit: ${circuit.state}`);
    return;
  }
  const legacy = await import('../cli/legacy-main.mjs');
  return legacy.main([command, ...args]);
}
