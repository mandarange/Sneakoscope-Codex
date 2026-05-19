import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot, readStdin } from '../core/fsx.js';
import { flag, readOption } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexLbMetrics, readCodexLbCircuit, recordCodexLbHealthEvent, resetCodexLbCircuit, codexLbProofEvidence } from '../core/codex-lb-circuit.js';
import { checkCodexLbResponseChain, codexLbStatus, configureCodexLb, formatCodexLbStatusText, releaseCodexLbAuthHold, repairCodexLbAuth, unselectCodexLbProvider } from '../cli/install-helpers.js';

export async function run(command: any, args: any = []) {
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
    const shaped = shapeCodexLbStatus(result);
    if (flag(args, '--json')) return printJson(shaped);
    process.stdout.write(formatCodexLbStatusText(result));
    return;
  }
  if (action === 'doctor') {
    const status = shapeCodexLbStatus(await codexLbStatus());
    const metrics = codexLbMetrics(await readCodexLbCircuit(root));
    const result = { schema: 'sks.codex-lb-doctor.v1', ok: Boolean(status.ok && metrics.ok), deep: flag(args, '--deep'), status, metrics };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb doctor: ${result.ok ? 'ok' : status.setup_needed ? 'setup_needed' : 'blocked'}`);
    if (!result.ok) process.exitCode = status.setup_needed ? 0 : 1;
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
    const options = await codexLbSetupOptions(args);
    if (!options.host || !options.apiKey) {
      const result = {
        schema: 'sks.codex-lb-setup.v1',
        ok: false,
        status: 'setup_needed',
        reason: !options.host ? 'missing_host_or_base_url' : 'missing_api_key',
        guidance: [
          'Run: sks codex-lb setup',
          'Or: sks codex-lb setup --host <domain> --api-key-stdin --yes'
        ]
      };
      if (flag(args, '--json')) return printJson(result);
      console.error('codex-lb API key is not configured.');
      console.error('Run:');
      console.error('  sks codex-lb setup');
      console.error('or:');
      console.error('  sks codex-lb setup --host <domain> --api-key-stdin --yes');
      process.exitCode = 1;
      return;
    }
    const result = await configureCodexLb({ host: options.host, apiKey: options.apiKey });
    const shaped: any = { schema: 'sks.codex-lb-setup.v1', ...result, api_key: { present: Boolean(options.apiKey), redacted: true }, env_file_chmod: '0600' };
    if (options.health) shaped.chain_health = result.ok ? await checkCodexLbResponseChain(result, { force: true, root }) : null;
    if (flag(args, '--json')) return printJson(shaped);
    console.log(`codex-lb configured: ${result.base_url || result.status}`);
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
    const { readJson } = await import('../core/fsx.js');
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

function shapeCodexLbStatus(status: any = {}) {
  return {
    schema: 'sks.codex-lb-status.v1',
    ...status,
    configured: Boolean(status.ok),
    setup_needed: !status.ok,
    api_key: {
      present: Boolean(status.env_key_configured),
      source: status.env_key_configured ? 'env-file' : null,
      redacted: true
    },
    env_auto_load: Boolean(status.env_file && status.env_key_configured),
    guidance: status.ok ? [] : [
      'codex-lb API key is not configured.',
      'Run: sks codex-lb setup',
      'Or: sks codex-lb setup --host <domain> --api-key-stdin --yes'
    ]
  };
}

async function codexLbSetupOptions(args: any = []) {
  const baseUrl = readOption(args, '--base-url', null);
  let host = baseUrl || readOption(args, '--host', readOption(args, '--domain', null));
  let apiKey = readOption(args, '--api-key', readOption(args, '--key', null));
  if (flag(args, '--api-key-stdin')) apiKey = (await readStdin()).trim();
  let health = flag(args, '--health') || flag(args, '--check');
  if ((!host || !apiKey) && canAskInteractive(args)) {
    console.log('SKS codex-lb setup\n');
    host ||= (await ask('1. codex-lb domain or base URL?\n   Example: lb.example.com or https://lb.example.com/backend-api/codex\n> ')).trim();
    apiKey ||= (await askHidden('2. API key?\n   Input hidden. Value will be stored securely and never printed.\n> ')).trim();
    await ask('3. Use this codex-lb as default for Codex launches? [Y/n] ');
    await ask('4. Write shell env loader to ~/.codex/sks-codex-lb.env? [Y/n] ');
    const runHealth = (await ask('5. Run health check now? [Y/n] ')).trim();
    health = !/^(n|no|아니|아니요|ㄴ)$/i.test(runHealth || 'y');
  }
  return { host, apiKey, health };
}

function canAskInteractive(args: any = []) {
  return !flag(args, '--json') && !flag(args, '--yes') && Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true');
}

async function ask(question: string) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function askHidden(question: string) {
  if (!input.isTTY || !output.isTTY) return ask(question);
  const rl: any = readline.createInterface({ input, output, terminal: true });
  rl.stdoutMuted = true;
  const original = rl._writeToOutput;
  rl._writeToOutput = function writeToOutput(value: string) {
    if (rl.stdoutMuted && !/\n|\r/.test(value)) return;
    return original.call(rl, value);
  };
  try {
    const answer = await rl.question(question);
    output.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}
