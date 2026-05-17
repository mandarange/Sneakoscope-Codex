import path from 'node:path';
import { projectRoot } from '../core/fsx.mjs';
import { flag, readOption } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { codexLbMetrics, readCodexLbCircuit, recordCodexLbHealthEvent, resetCodexLbCircuit, codexLbProofEvidence } from '../core/codex-lb-circuit.mjs';
import { checkCodexLbResponseChain, codexLbStatus, configureCodexLb, formatCodexLbStatusText, releaseCodexLbAuthHold, repairCodexLbAuth, unselectCodexLbProvider } from '../cli/install-helpers.mjs';

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
  if (action === 'status' || action === 'check') {
    const result = await codexLbStatus();
    if (flag(args, '--json')) return printJson(result);
    process.stdout.write(formatCodexLbStatusText(result));
    return;
  }
  if (action === 'health' || action === 'verify-chain' || action === 'chain') {
    const status = await codexLbStatus();
    const result = status.ok ? await checkCodexLbResponseChain(status, { force: true, root }) : { ok: false, status: 'not_configured', codex_lb: status };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb response chain: ${result.ok ? 'ok' : `failed (${result.status})`}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'repair' || action === 'resync' || action === 'login') {
    const result = await repairCodexLbAuth();
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb repair: ${result.ok ? 'ok' : result.status}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'release') {
    const result = await releaseCodexLbAuthHold({ keepProvider: flag(args, '--keep-provider'), deleteBackup: flag(args, '--delete-backup'), force: flag(args, '--force') });
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb release: ${result.status}`);
    if (['no_backup', 'auth_in_use', 'failed'].includes(result.status)) process.exitCode = 1;
    return;
  }
  if (action === 'unselect') {
    const result = await unselectCodexLbProvider();
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb unselect: ${result.status}`);
    if (result.status === 'failed') process.exitCode = 1;
    return;
  }
  if (action === 'setup' || action === 'reconfigure') {
    const host = readOption(args, '--host', readOption(args, '--domain', null));
    const apiKey = readOption(args, '--api-key', readOption(args, '--key', null));
    if (!host || !apiKey) {
      const result = { ok: false, reason: 'missing_host_or_api_key' };
      if (flag(args, '--json')) return printJson(result);
      console.error('Usage: sks codex-lb setup|reconfigure --host <domain> --api-key <key>');
      process.exitCode = 1;
      return;
    }
    const result = await configureCodexLb({ host, apiKey });
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb configured: ${result.base_url || result.status}`);
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
  if (action === 'proof-evidence') {
    const result = await codexLbProofEvidence(root);
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb proof evidence: ${result.status}`);
    return;
  }
  console.error('Usage: sks codex-lb status|metrics|doctor --deep|health|repair|release|unselect|setup|circuit reset|circuit record-fixture|proof-evidence [--json]');
  process.exitCode = 1;
}
