import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot, readStdin } from '../core/fsx.js';
import { flag, readOption } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexLbMetrics, readCodexLbCircuit, recordCodexLbHealthEvent, resetCodexLbCircuit, codexLbProofEvidence } from '../core/codex-lb-circuit.js';
import { checkCodexLbResponseChain, codexLbStatus, configureCodexLb, formatCodexLbStatusText, releaseCodexLbAuthHold, repairCodexLbAuth, unselectCodexLbProvider } from '../cli/install-helpers.js';
import { buildCodexLbSetupPlan, codexLbPersistenceSummary, renderCodexLbSetupPlan } from '../core/codex-lb/codex-lb-setup.js';

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
    const blocker = !status.env_key_configured ? 'missing_env_key' : !status.base_url ? 'missing_base_url' : 'not_configured';
    const result = status.ok ? await checkCodexLbResponseChain(status, { force: true, root }) : { ok: false, status: blocker, codex_lb: status };
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
  if (action === 'set-key' || action === 'update-key' || action === 'rotate-key') {
    // Swap ONLY the API key, reusing the already-stored base URL (no need to re-type the host).
    const status = await codexLbStatus();
    const host = status.base_url;
    if (!host) {
      const result = { schema: 'sks.codex-lb-set-key.v1', ok: false, status: 'not_configured' };
      if (flag(args, '--json')) return printJson(result);
      console.error('codex-lb is not configured yet. Run: sks codex-lb setup --host <domain> --api-key-stdin');
      process.exitCode = 1;
      return;
    }
    const newKey = await resolveNewApiKey(args);
    if (!newKey) {
      const result = { schema: 'sks.codex-lb-set-key.v1', ok: false, status: 'missing_api_key' };
      if (flag(args, '--json')) return printJson(result);
      console.error('No new API key provided. Run: sks codex-lb set-key --api-key-stdin   (or --api-key <key>)');
      process.exitCode = 1;
      return;
    }
    const result = await configureCodexLb({ host, apiKey: newKey });
    if (flag(args, '--json')) return printJson({ ...result, action: 'set-key' });
    console.log(result.ok ? `codex-lb API key updated (${result.base_url || host}).` : `codex-lb key update failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'use-codex-lb' || action === 'use-lb') {
    // Switch auth mode -> codex-lb (API key). Re-selects the provider and re-syncs auth.
    const result = await repairCodexLbAuth();
    if (flag(args, '--json')) return printJson({ ...result, mode: 'codex-lb' });
    console.log(result.ok ? 'Auth mode: codex-lb selected (API key).' : `Switch to codex-lb failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'use-oauth' || action === 'use-chatgpt') {
    // Switch auth mode -> ChatGPT OAuth. Restores the saved OAuth login if present.
    const result = await releaseCodexLbAuthHold({ force: flag(args, '--force') });
    if (flag(args, '--json')) return printJson({ ...result, mode: 'oauth' });
    if (result.status === 'no_backup') {
      console.log('No saved ChatGPT OAuth credentials to restore. Switch to OAuth by logging in:');
      console.log('  codex login');
      console.log('Then, if codex-lb is still the selected provider: sks codex-lb unselect');
      process.exitCode = 1;
      return;
    }
    console.log(`Auth mode: ${['released', 'oauth_restored'].includes(result.status) ? 'ChatGPT OAuth restored' : result.status}.`);
    if (['auth_in_use', 'failed'].includes(result.status)) process.exitCode = 1;
    return;
  }
  if (action === 'setup' || action === 'reconfigure') {
    const options = await codexLbSetupOptions(args);
    const plan = buildCodexLbSetupPlan({
      host_or_base_url: options.host || '',
      api_key_source: options.apiKeySource,
      use_as_default_provider: options.useDefaultProvider,
      write_env_file: options.writeEnvFile,
      store_keychain: options.keychain,
      sync_launchctl: options.syncLaunchctl,
      install_shell_profile: options.shellProfile,
      run_health_check: options.health,
      allow_insecure_localhost: options.allowInsecureLocalhost
    });
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
    if (flag(args, '--plan')) {
      const result = { schema: 'sks.codex-lb-setup-plan-result.v1', ok: plan.blockers.length === 0, plan, writes: false, expected_actions: plan.expected_actions, persistence: plan.persistence };
      if (flag(args, '--json')) return printJson(result);
      process.stdout.write(renderCodexLbSetupPlan(plan));
      if (!result.ok) process.exitCode = 1;
      return;
    }
    const processOnly = plan.persistence.effective_mode === 'process_only_ephemeral';
    if (options.interactive && !options.yes) {
      process.stdout.write(renderCodexLbSetupPlan(plan));
      const confirm = (await ask('Apply this codex-lb setup plan? [y/N] ')).trim();
      if (!/^(y|yes|예|네|응)$/i.test(confirm)) {
        const result = { schema: 'sks.codex-lb-setup.v1', ok: false, status: 'cancelled', plan, applied_actions: [] };
        if (flag(args, '--json')) return printJson(result);
        console.log('codex-lb setup cancelled.');
        process.exitCode = 1;
        return;
      }
      if (processOnly) {
        const confirmProcessOnly = (await ask('This setup keeps credentials only in the current process. Type process-only to continue: ')).trim();
        if (confirmProcessOnly !== 'process-only') {
          const result = { schema: 'sks.codex-lb-setup.v1', ok: false, status: 'process_only_cancelled', plan, applied_actions: [], persistence: plan.persistence };
          if (flag(args, '--json')) {
            printJson(result);
            process.exitCode = 1;
            return;
          }
          console.log('codex-lb setup cancelled: process-only ephemeral setup was not confirmed.');
          process.exitCode = 1;
          return;
        }
      }
    } else if (processOnly && !options.yes) {
      const result = {
        schema: 'sks.codex-lb-setup.v1',
        ok: false,
        status: 'process_only_requires_yes',
        plan,
        applied_actions: [],
        persistence: plan.persistence,
        guidance: ['Pass --yes to acknowledge process_only_ephemeral setup, or enable --write-env-file, --keychain, --launchctl, or --shell-profile.']
      };
      if (flag(args, '--json')) {
        printJson(result);
        process.exitCode = 1;
        return;
      }
      console.error('codex-lb setup would be process-only ephemeral. Pass --yes to acknowledge, or enable a durable persistence mode.');
      process.exitCode = 1;
      return;
    }
    const result = await configureCodexLb({
      host: options.host,
      apiKey: options.apiKey,
      keychain: options.keychain,
      storeKeychain: options.keychain,
      useDefaultProvider: options.useDefaultProvider,
      writeEnvFile: options.writeEnvFile,
      syncLaunchctl: options.syncLaunchctl,
      shellProfile: options.shellProfile,
      runHealth: options.health,
      apiKeySource: options.apiKeySource,
      allowInsecureHttp: options.allowInsecureLocalhost
    });
    const shaped: any = { schema: 'sks.codex-lb-setup.v1', ...result, api_key: { present: Boolean(options.apiKey), redacted: true }, env_file_chmod: '0600' };
    if (options.health) shaped.applied_actions = [...(shaped.applied_actions || []), { type: 'run_health_check', target: 'codex-lb response chain', ok: true }];
    if (options.health) shaped.chain_health = result.ok ? await checkCodexLbResponseChain(result, { force: true, root }) : null;
    if (flag(args, '--json')) return printJson(shaped);
    console.log(`codex-lb configured: ${result.base_url || result.status}`);
    if (shaped.persistence?.warning) console.log(`warning: ${shaped.persistence.warning}`);
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
  console.error('Usage: sks codex-lb status|metrics|doctor --deep|health|setup|set-key|use-codex-lb|use-oauth|repair|release|unselect|circuit reset|circuit record-fixture|proof-evidence [--json]');
  console.error('  set-key       swap the codex-lb API key (reuses the stored host): sks codex-lb set-key --api-key-stdin');
  console.error('  use-codex-lb  switch auth mode to codex-lb (API key)');
  console.error('  use-oauth     switch auth mode to ChatGPT OAuth (restores saved login, else: codex login)');
  process.exitCode = 1;
}

async function resolveNewApiKey(args: any = []): Promise<string> {
  const flagKey = readOption(args, '--api-key', '');
  if (flagKey) return String(flagKey).trim();
  if (flag(args, '--api-key-stdin')) return String(await readStdin()).trim();
  if (input.isTTY && !flag(args, '--yes')) {
    const rl = readline.createInterface({ input, output });
    try {
      return (await rl.question('New codex-lb API key (sk-clb-...): ')).trim();
    } finally {
      rl.close();
    }
  }
  return '';
}

function shapeCodexLbStatus(status: any = {}) {
  const modes: any[] = [];
  if (status.env_file && status.env_key_configured) modes.push('durable_env_file');
  if (status.env_loader?.api_key?.source === 'keychain' || status.env_loader?.keychain?.status === 'present') modes.push('durable_keychain');
  if (status.launch_environment?.status === 'synced') modes.push('durable_launchctl');
  if (!modes.length && status.env_loader?.api_key?.source === 'process.env') modes.push('process_only_ephemeral');
  const mode = modes[0] || 'none';
  const persistence = codexLbPersistenceSummary({
    selectedModes: modes.length ? modes : [],
    appliedModes: modes.length ? modes : mode === 'none' ? ['none'] : [mode],
    processOnly: mode === 'process_only_ephemeral'
  });
  return {
    schema: 'sks.codex-lb-status.v1',
    ...status,
    configured: Boolean(status.ok),
    setup_needed: !status.ok,
    repair_available: !status.ok,
    api_key: {
      present: Boolean(status.env_key_configured),
      source: status.env_loader?.api_key?.source || null,
      redacted: true
    },
    persistence,
    env_loader: status.env_loader || null,
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
  let apiKeySource: 'hidden_prompt' | 'stdin' | 'cli_option' | 'keychain_existing' = apiKey ? 'cli_option' : 'hidden_prompt';
  let keychain = flag(args, '--keychain');
  if (flag(args, '--api-key-stdin')) apiKey = (await readStdin()).trim();
  if (flag(args, '--api-key-stdin')) apiKeySource = 'stdin';
  let health = (flag(args, '--health') || flag(args, '--check')) && !flag(args, '--no-health');
  let useDefaultProvider = flag(args, '--no-default-provider') ? false : true;
  if (flag(args, '--use-default-provider')) useDefaultProvider = true;
  let writeEnvFile = flag(args, '--no-env-file') ? false : true;
  if (flag(args, '--write-env-file')) writeEnvFile = true;
  if (flag(args, '--no-keychain')) keychain = false;
  let syncLaunchctl = flag(args, '--no-launchctl') ? false : true;
  if (flag(args, '--launchctl')) syncLaunchctl = true;
  const shellProfile = normalizeShellProfile(readOption(args, '--shell-profile', 'skip'));
  const allowInsecureLocalhost = flag(args, '--allow-insecure-localhost') || flag(args, '--allow-insecure-http');
  const interactive = (!host || !apiKey || canAskInteractive(args)) && canAskInteractive(args);
  if ((!host || !apiKey) && canAskInteractive(args)) {
    console.log('SKS codex-lb setup\n');
    host ||= (await ask('1. codex-lb domain or base URL?\n   Example: lb.example.com or https://lb.example.com/backend-api/codex\n> ')).trim();
    apiKey ||= (await askHidden('2. API key?\n   Input hidden. Value will be stored securely and never printed.\n> ')).trim();
    apiKeySource = 'hidden_prompt';
    useDefaultProvider = parseYesNo(await ask('3. Use this codex-lb as default for Codex launches? [Y/n] '), true);
    writeEnvFile = parseYesNo(await ask('4. Write shell env loader to ~/.codex/sks-codex-lb.env? [Y/n] '), true);
    const storeKeychain = (await ask('5. Store the key in macOS Keychain when available? [Y/n] ')).trim();
    keychain = !/^(n|no|아니|아니요|ㄴ)$/i.test(storeKeychain || 'y');
    syncLaunchctl = parseYesNo(await ask('6. Sync macOS launchctl environment when available? [Y/n] '), true);
    const profile = (await ask('7. Install shell profile snippet? [zsh/bash/fish/all/skip] ')).trim();
    const interactiveShellProfile = normalizeShellProfile(profile || 'skip');
    const runHealth = (await ask('8. Run health check now? [Y/n] ')).trim();
    health = !/^(n|no|아니|아니요|ㄴ)$/i.test(runHealth || 'y');
    return { host, apiKey, health, keychain, useDefaultProvider, writeEnvFile, syncLaunchctl, shellProfile: interactiveShellProfile, allowInsecureLocalhost, apiKeySource, interactive: true, yes: flag(args, '--yes') };
  }
  return { host, apiKey, health, keychain, useDefaultProvider, writeEnvFile, syncLaunchctl, shellProfile, allowInsecureLocalhost, apiKeySource, interactive, yes: flag(args, '--yes') };
}

function normalizeShellProfile(value: any): 'zsh' | 'bash' | 'fish' | 'all' | 'skip' {
  const raw = String(value || 'skip').toLowerCase();
  return raw === 'zsh' || raw === 'bash' || raw === 'fish' || raw === 'all' ? raw : 'skip';
}

function parseYesNo(value: unknown, fallback: boolean): boolean {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^(y|yes|예|네|응)$/i.test(raw)) return true;
  if (/^(n|no|아니|아니요|ㄴ)$/i.test(raw)) return false;
  return fallback;
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
