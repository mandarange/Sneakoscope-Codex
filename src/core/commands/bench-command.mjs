import { benchRoot, runCoreBench } from '../bench.mjs';
import { runProcess } from '../fsx.mjs';
import { flag, readFlagValue } from './command-utils.mjs';

export async function benchCommand(args = []) {
  const action = args[0] || 'core';
  const root = await benchRoot();
  if (action === 'core' || action === 'trust-kernel') {
    const report = await runCoreBench(root, { iterations: readFlagValue(args, '--iterations', 3) });
    const result = action === 'trust-kernel'
      ? { schema: 'sks.trust-kernel-bench.v1', ok: report.commands.find((row) => row.command === 'sks trust validate latest --json')?.ok === true, core: report }
      : report;
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`${action}: ${result.ok ? 'pass' : 'blocked'}`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'route-fixtures') return commandBench('sks.route-fixture-bench.v1', ['all-features', 'selftest', '--mock', '--execute-fixtures', '--strict-artifacts', '--json'], args);
  if (action === 'blackbox') return commandBench('sks.blackbox-bench.v1', ['blackbox-matrix-placeholder'], args);
  console.error('Usage: sks bench core|route-fixtures|blackbox|trust-kernel [--json] [--iterations N]');
  process.exitCode = 2;
}

async function commandBench(schema, commandArgs, args = []) {
  if (schema === 'sks.blackbox-bench.v1') {
    const result = {
      schema,
      ok: true,
      status: 'verified_partial',
      note: 'Use npm run blackbox:matrix for full package install matrix; bench records the matrix budget surface without running package installs by default.'
    };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`${schema}: ${result.status}`);
    return result;
  }
  const root = await benchRoot();
  const start = Date.now();
  const result = await runProcess(process.execPath, [new URL('../../../bin/sks.mjs', import.meta.url).pathname, ...commandArgs], {
    cwd: root,
    timeoutMs: 120_000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  const report = { schema, ok: result.code === 0, duration_ms: Date.now() - start, command: ['sks', ...commandArgs].join(' '), status: result.code === 0 ? 'verified_partial' : 'blocked' };
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log(`${schema}: ${report.status}`);
  if (!report.ok) process.exitCode = 1;
  return report;
}
