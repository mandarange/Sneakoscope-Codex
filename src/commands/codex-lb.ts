import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot, readStdin, readText } from '../core/fsx.js';
import { flag, readOption } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexLbMetrics, readCodexLbCircuit, recordCodexLbHealthEvent, resetCodexLbCircuit, codexLbProofEvidence } from '../core/codex-lb-circuit.js';
import { checkCodexLbResponseChain, codexLbStatus, configureCodexLb, formatCodexLbStatusText, releaseCodexLbAuthHold, repairCodexLbAuth, unselectCodexLbProvider } from '../cli/install-helpers.js';
import { buildCodexLbSetupPlan, codexLbPersistenceSummary, renderCodexLbSetupPlan } from '../core/codex-lb/codex-lb-setup.js';
import {
  CODEX_LB_TOOL_OUTPUT_RECOVERY_OVERRIDE_FLAG,
  codexLbToolOutputRecoveryOverrideAcknowledged
} from '../core/codex-lb/codex-lb-tool-output-recovery.js';
import { restartCodexApp } from '../core/codex-app/codex-app-restart.js';
import { repairCodexAppFastUi } from '../core/codex-app/codex-app-fast-ui-repair.js';

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
    const allowUnverifiedToolOutputRecovery = codexLbToolOutputRecoveryOverrideAcknowledged({ args });
    const result = await codexLbStatus({ probeToolOutputRecovery: true, allowUnverifiedToolOutputRecovery });
    const shaped = shapeCodexLbStatus(result);
    if (result.selected && result.tool_output_recovery?.ok !== true) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(shaped);
    process.stdout.write(formatCodexLbStatusText(result));
    return;
  }
  if (action === 'doctor') {
    const allowUnverifiedToolOutputRecovery = codexLbToolOutputRecoveryOverrideAcknowledged({ args });
    const status = shapeCodexLbStatus(await codexLbStatus({ probeToolOutputRecovery: true, allowUnverifiedToolOutputRecovery }));
    const metrics = codexLbMetrics(await readCodexLbCircuit(root));
    const result = { schema: 'sks.codex-lb-doctor.v1', ok: Boolean(status.ok && metrics.ok), deep: flag(args, '--deep'), status, metrics };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb doctor: ${result.ok ? 'ok' : status.setup_needed ? 'setup_needed' : 'blocked'}`);
    if (!result.ok) process.exitCode = status.setup_needed ? 0 : 1;
    return;
  }
  if (action === 'health' || action === 'verify-chain' || action === 'chain') {
    const allowUnverifiedToolOutputRecovery = codexLbToolOutputRecoveryOverrideAcknowledged({ args });
    const status = await codexLbStatus({ probeToolOutputRecovery: true, allowUnverifiedToolOutputRecovery });
    const blocker = !status.env_key_configured ? 'missing_env_key' : !status.base_url ? 'missing_base_url' : 'not_configured';
    const result = status.selected && status.tool_output_recovery?.ok !== true
      ? { ok: false, status: 'tool_output_recovery_blocked', codex_lb: status, tool_output_recovery: status.tool_output_recovery }
      : status.ok
        ? await checkCodexLbResponseChain(status, { force: true, root, fastMode: flag(args, '--fast') || flag(args, '--priority') })
        : { ok: false, status: blocker, codex_lb: status };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb response chain: ${result.ok ? 'ok' : `failed (${result.status})`}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'fast-check' || action === 'fast' || action === 'verify-fast') {
    const allowUnverifiedToolOutputRecovery = codexLbToolOutputRecoveryOverrideAcknowledged({ args });
    const status = await codexLbStatus({ probeToolOutputRecovery: true, allowUnverifiedToolOutputRecovery });
    const blocker = !status.env_key_configured ? 'missing_env_key' : !status.base_url ? 'missing_base_url' : !status.provider_contract_ok ? 'provider_contract_drift' : 'not_configured';
    const modelSelection = await resolveCodexLbFastCheckModel(status);
    const chain = status.selected && status.tool_output_recovery?.ok !== true
      ? { ok: false, status: 'tool_output_recovery_blocked', codex_lb: status, tool_output_recovery: status.tool_output_recovery }
      : status.env_key_configured && status.base_url && modelSelection.model
      ? await checkCodexLbResponseChain(status, { force: true, cache: false, root, fastMode: true, model: modelSelection.model })
      : { ok: false, status: modelSelection.model ? blocker : 'model_unselected', codex_lb: status };
    const evidence = await fastEvidenceFromChain(chain, readOption(args, '--request-log', readOption(args, '--request-log-json', null)));
    const providerReady = status.provider_contract_ok === true;
    const chainVerified = isCodexLbFastChainVerified(chain);
    const result = {
      schema: 'sks.codex-lb-fast-check.v1',
      ok: Boolean(providerReady && chainVerified && evidence.fast_requested && evidence.fast_actual),
      status: !providerReady
        ? 'provider_contract_drift'
        : chain.skipped === true
          ? 'fast_check_chain_skipped'
        : chainVerified
        ? evidence.fast_actual
          ? 'fast_verified'
          : evidence.fast_requested
            ? 'fast_requested_but_actual_unverified'
            : 'fast_not_requested'
        : chain.status,
      codex_lb: status,
      model_selection: modelSelection,
      chain,
      evidence,
      degraded_models: Array.isArray((chain as any).degraded_models) ? (chain as any).degraded_models : [],
      quota_low: Boolean((chain as any).quota_low),
      blockers: [
        ...(providerReady ? [] : ['codex_lb_provider_contract_drift']),
        ...modelSelection.blockers,
        ...(chain.skipped === true
          ? ['codex_lb_fast_check_chain_skipped']
          : chainVerified
          ? evidence.fast_actual
            ? []
            : [evidence.fast_requested ? 'codex_lb_actual_fast_service_tier_unverified' : 'codex_lb_fast_service_tier_not_requested']
          : [chain.status || blocker])
      ]
    };
    if (flag(args, '--json')) return printJson(result);
    console.log(`codex-lb fast check: ${result.ok ? 'ok' : `blocked (${result.status})`}`);
    if (!result.ok) {
      console.log('Need codex-lb request evidence: requestedServiceTier=priority and actualServiceTier/serviceTier=priority.');
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'repair' || action === 'resync' || action === 'login') {
    const result = await repairCodexLbAuth({
      allowUnverifiedToolOutputRecovery: codexLbToolOutputRecoveryOverrideAcknowledged({ args })
    });
    const fastUi = await repairCodexAppFastUiAfterMutation(root, Boolean(result.ok));
    const shaped = { ...result, ok: Boolean(result.ok && fastUi.ok), codex_app_fast_ui: fastUi };
    if (!shaped.ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(shaped);
    console.log(`codex-lb repair: ${shaped.ok ? 'ok' : result.ok ? 'fast_ui_repair_failed' : result.status}`);
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
      if (flag(args, '--json')) {
        process.exitCode = 1;
        return printJson(result);
      }
      console.error('codex-lb is not configured yet. Run: sks codex-lb setup --host <domain> --api-key-stdin');
      process.exitCode = 1;
      return;
    }
    const newKey = await resolveNewApiKey(args);
    if (!newKey) {
      const result = { schema: 'sks.codex-lb-set-key.v1', ok: false, status: 'missing_api_key' };
      if (flag(args, '--json')) {
        process.exitCode = 1;
        return printJson(result);
      }
      console.error('No new API key provided. Run: sks codex-lb set-key --api-key-stdin   (or --api-key <key>)');
      process.exitCode = 1;
      return;
    }
    const result = await configureCodexLb({
      host,
      apiKey: newKey,
      authMode: flag(args, '--preserve-auth') ? 'preserve' : 'codex-lb',
      forceCodexLbApiKeyAuth: !flag(args, '--preserve-auth'),
      allowUnverifiedToolOutputRecovery: codexLbToolOutputRecoveryOverrideAcknowledged({ args })
    });
    const fastUi = await repairCodexAppFastUiAfterMutation(root, Boolean(result.ok));
    const restart = await maybeRestartCodexAppForAuthSwitch(args, Boolean(result.ok && fastUi.ok));
    const ok = Boolean(result.ok && fastUi.ok && restart?.ok !== false);
    const output = { ...result, ok, action: 'set-key', codex_app_fast_ui: fastUi, restart_app: restart };
    if (!ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(output);
    console.log(result.ok ? `codex-lb API key updated (${result.base_url || host}).` : `codex-lb key update failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    if (restart?.status === 'restarted') console.log('Codex App restarted for the new codex-lb auth mode.');
    if (!ok) process.exitCode = 1;
    return;
  }
  if (action === 'use-codex-lb' || action === 'use-lb') {
    // Switch auth mode -> codex-lb (API key). Re-selects the provider and re-syncs auth.
    const result = await repairCodexLbAuth({
      forceCodexLbApiKeyAuth: true,
      authMode: 'codex-lb',
      forceFastMode: !flag(args, '--no-fast'),
      allowUnverifiedToolOutputRecovery: codexLbToolOutputRecoveryOverrideAcknowledged({ args })
    });
    const fastUi = await repairCodexAppFastUiAfterMutation(root, Boolean(result.ok));
    const restart = await maybeRestartCodexAppForAuthSwitch(args, Boolean(result.ok && fastUi.ok));
    const ok = Boolean(result.ok && fastUi.ok && restart?.ok !== false);
    const shaped = { ...result, ok, mode: 'codex-lb', codex_app_fast_ui: fastUi, restart_app: restart };
    if (!ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(shaped);
    console.log(result.ok ? 'Auth mode: codex-lb selected (API key).' : `Switch to codex-lb failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    if (restart?.status === 'restarted') console.log('Codex App restarted for codex-lb auth.');
    if (!ok) process.exitCode = 1;
    return;
  }
  if (action === 'use-oauth' || action === 'use-chatgpt') {
    // Switch auth mode -> ChatGPT OAuth. Restores the saved OAuth login if present.
    const result = await releaseCodexLbAuthHold({ force: flag(args, '--force') });
    const authOk = !['no_backup', 'auth_in_use', 'failed'].includes(result.status);
    const fastUi = await repairCodexAppFastUiAfterMutation(root, authOk);
    const restart = await maybeRestartCodexAppForAuthSwitch(args, Boolean(authOk && fastUi.ok));
    const ok = Boolean(authOk && fastUi.ok && restart?.ok !== false);
    const shaped = { ...result, ok, mode: 'oauth', codex_app_fast_ui: fastUi, restart_app: restart };
    if (!ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(shaped);
    if (result.status === 'no_backup') {
      console.log('No saved ChatGPT OAuth credentials to restore. Switch to OAuth by logging in:');
      console.log('  codex login');
      console.log('Then, if codex-lb is still the selected provider: sks codex-lb unselect');
      process.exitCode = 1;
      return;
    }
    console.log(`Auth mode: ${['released', 'oauth_restored'].includes(result.status) ? 'ChatGPT OAuth restored' : result.status}.`);
    if (restart?.status === 'restarted') console.log('Codex App restarted for ChatGPT OAuth.');
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
      if (flag(args, '--json')) {
        process.exitCode = 1;
        return printJson(result);
      }
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
      if (!result.ok) process.exitCode = 1;
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
        if (flag(args, '--json')) {
          process.exitCode = 1;
          return printJson(result);
        }
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
      authMode: flag(args, '--preserve-auth') ? 'preserve' : 'codex-lb',
      forceCodexLbApiKeyAuth: !flag(args, '--preserve-auth'),
      forceFastMode: !flag(args, '--no-fast'),
      keychain: options.keychain,
      storeKeychain: options.keychain,
      useDefaultProvider: options.useDefaultProvider,
      writeEnvFile: options.writeEnvFile,
      syncLaunchctl: options.syncLaunchctl,
      shellProfile: options.shellProfile,
      runHealth: options.health,
      apiKeySource: options.apiKeySource,
      allowInsecureHttp: options.allowInsecureLocalhost,
      allowUnverifiedToolOutputRecovery: codexLbToolOutputRecoveryOverrideAcknowledged({ args })
    });
    const fastUi = await repairCodexAppFastUiAfterMutation(root, Boolean(result.ok));
    const restart = await maybeRestartCodexAppForAuthSwitch(args, Boolean(result.ok && fastUi.ok) && !flag(args, '--preserve-auth'));
    const shaped: any = { schema: 'sks.codex-lb-setup.v1', ...result, api_key: { present: Boolean(options.apiKey), redacted: true }, env_file_chmod: '0600', codex_app_fast_ui: fastUi };
    shaped.restart_app = restart;
    if (options.health) shaped.applied_actions = [...(shaped.applied_actions || []), { type: 'run_health_check', target: 'codex-lb response chain', ok: true }];
    if (options.health) shaped.chain_health = result.ok ? await checkCodexLbResponseChain(result, { force: true, root }) : null;
    shaped.ok = Boolean(result.ok && fastUi.ok && restart?.ok !== false);
    if (!shaped.ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(shaped);
    console.log(`codex-lb configured: ${result.base_url || result.status}`);
    if (shaped.persistence?.warning) console.log(`warning: ${shaped.persistence.warning}`);
    if (!shaped.ok) process.exitCode = 1;
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
  console.error(`  ${CODEX_LB_TOOL_OUTPUT_RECOVERY_OVERRIDE_FLAG}  explicitly acknowledge an old/unverified proxy for this command (unsafe)`);
  console.error('  set-key       swap the codex-lb API key (reuses the stored host): sks codex-lb set-key --api-key-stdin');
  console.error('  use-codex-lb  switch auth mode to codex-lb (API key)');
  console.error('  use-oauth     switch auth mode to ChatGPT OAuth (restores saved login, else: codex login)');
  process.exitCode = 1;
}

async function maybeRestartCodexAppForAuthSwitch(args: any[] = [], enabled: boolean) {
  if (!enabled) return { schema: 'sks.codex-app-restart.v1', ok: true, status: 'skipped', skipped: true, reason: 'previous_step_failed', app_name: 'ChatGPT', bundle_id: 'com.openai.codex', blockers: [] };
  const requested = flag(args, '--restart-app') || flag(args, '--restart');
  const shouldRestart = requested || (!flag(args, '--json') && !flag(args, '--no-restart-app') && !flag(args, '--no-restart'));
  return restartCodexApp({ enabled: shouldRestart });
}

async function repairCodexAppFastUiAfterMutation(root: string, enabled: boolean) {
  if (!enabled) {
    return {
      schema: 'sks.codex-app-fast-ui-repair.v1',
      ok: true,
      status: 'skipped',
      skipped: true,
      reason: 'previous_step_failed',
      actions: [],
      blockers: []
    };
  }
  try {
    return await repairCodexAppFastUi(root, { apply: true });
  } catch (err: any) {
    return {
      schema: 'sks.codex-app-fast-ui-repair.v1',
      ok: false,
      status: 'failed',
      actions: [],
      blockers: ['codex_app_fast_ui_repair_failed'],
      error: String(err?.message || err)
    };
  }
}

export function isCodexLbFastChainVerified(chain: any = {}) {
  return chain.ok === true && chain.skipped !== true;
}

export async function resolveCodexLbFastCheckModel(status: any = {}, env: NodeJS.ProcessEnv = process.env) {
  const explicit = String(env.SKS_CODEX_MODEL || env.CODEX_MODEL || '').trim();
  if (explicit) return { model: explicit, source: env.SKS_CODEX_MODEL ? 'SKS_CODEX_MODEL' : 'CODEX_MODEL', blockers: [] };

  const configPath = String(status.config_path || '').trim();
  const config = configPath ? await readText(configPath, '').catch(() => '') : '';
  const configured = topLevelTomlString(config, 'model');
  if (configured) return { model: configured, source: 'global_config', blockers: [] };

  const configuredCatalogPath = topLevelTomlString(config, 'model_catalog_json');
  if (!configuredCatalogPath) return { model: null, source: null, blockers: ['codex_lb_fast_check_model_unselected'] };
  const home = String(env.HOME || '').trim();
  const expandedCatalogPath = configuredCatalogPath.startsWith('~/') && home
    ? path.join(home, configuredCatalogPath.slice(2))
    : configuredCatalogPath;
  const catalogPath = path.isAbsolute(expandedCatalogPath)
    ? expandedCatalogPath
    : path.resolve(path.dirname(configPath), expandedCatalogPath);
  try {
    const payload = JSON.parse(await readText(catalogPath, ''));
    const model = selectPriorityCapableCatalogModel(payload);
    return model
      ? { model, source: 'model_catalog_json', blockers: [] }
      : { model: null, source: 'model_catalog_json', blockers: ['codex_lb_fast_check_priority_model_unavailable'] };
  } catch {
    return { model: null, source: 'model_catalog_json', blockers: ['codex_lb_fast_check_catalog_invalid'] };
  }
}

function topLevelTomlString(text: string, key: string) {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (topLevel.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*=\\s*"([^"]+)"`))?.[1] || '').trim();
}

function selectPriorityCapableCatalogModel(payload: any = {}) {
  const models = Array.isArray(payload?.models) ? payload.models : Array.isArray(payload?.data) ? payload.data : [];
  return models
    .filter((row: any) => {
      if (!row || typeof row !== 'object' || row.supported_in_api !== true || typeof row.slug !== 'string' || !row.slug.trim()) return false;
      const serviceTiers = Array.isArray(row.service_tiers) ? row.service_tiers : [];
      const speedTiers = Array.isArray(row.additional_speed_tiers) ? row.additional_speed_tiers : [];
      return serviceTiers.some((tier: any) => normalizeTier(typeof tier === 'string' ? tier : tier?.id) === 'priority')
        || speedTiers.some((tier: any) => normalizeTier(tier) === 'priority');
    })
    .sort((left: any, right: any) => Number(left.priority ?? Number.MAX_SAFE_INTEGER) - Number(right.priority ?? Number.MAX_SAFE_INTEGER)
      || String(left.slug).localeCompare(String(right.slug)))[0]?.slug || null;
}

export async function fastEvidenceFromChain(chain: any = {}, requestLogPath: any = null) {
  const chainEvidence = chain.service_tier_evidence || {};
  const logRows = requestLogPath ? await readRequestLogRows(String(requestLogPath)) : [];
  const logEvidence = serviceTierEvidenceFromRows(logRows);
  const requested = logEvidence.requested_service_tier || chainEvidence.requested_service_tier || chain.requested_service_tier || null;
  const actual = logEvidence.actual_service_tier || chainEvidence.actual_service_tier || null;
  const effective = logEvidence.effective_service_tier || chainEvidence.effective_service_tier || null;
  return {
    requested_service_tier: requested,
    actual_service_tier: actual,
    effective_service_tier: effective,
    fast_requested: requested === 'priority' || chain.requested_service_tier === 'priority' || chainEvidence.fast_requested === true,
    fast_actual: actual === 'priority' || effective === 'priority' || logEvidence.fast_actual === true || chainEvidence.fast_actual === true,
    chain_evidence: chainEvidence,
    request_log_path: requestLogPath || null,
    request_log_rows: logRows.length
  };
}

async function readRequestLogRows(file: string) {
  if (!file) return [];
  const text = await readText(path.isAbsolute(file) ? file : path.resolve(process.cwd(), file), '').catch(() => '');
  const rows: any[] = [];
  const trimmed = text.trim();
  if (!trimmed) return rows;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.requests)) return parsed.requests;
    return [parsed];
  } catch {}
  for (const line of text.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate) continue;
    try { rows.push(JSON.parse(candidate)); } catch {}
  }
  return rows;
}

export function serviceTierEvidenceFromRows(rows: any[] = []) {
  let requested: string | null = null;
  let actual: string | null = null;
  let effective: string | null = null;
  for (const row of rows) {
    requested ||= normalizeTier(row?.requestedServiceTier || row?.requested_service_tier || row?.request?.service_tier || row?.body?.service_tier);
    actual ||= normalizeTier(row?.actualServiceTier || row?.actual_service_tier || row?.response?.actualServiceTier || row?.response?.actual_service_tier);
    effective ||= responseServiceTier(row);
  }
  return {
    requested_service_tier: requested,
    actual_service_tier: actual,
    effective_service_tier: effective,
    fast_actual: actual === 'priority' || effective === 'priority'
  };
}

function responseServiceTier(row: any) {
  const nested = normalizeTier(row?.response?.serviceTier || row?.response?.service_tier || row?.event?.response?.serviceTier || row?.event?.response?.service_tier);
  if (nested) return nested;
  const responseKind = String(row?.direction || row?.phase || row?.kind || row?.type || '').trim().toLowerCase();
  const responseBody = row?.object === 'response' || /^resp[_-]/i.test(String(row?.id || '')) || Array.isArray(row?.output);
  if (responseBody || responseKind === 'response' || responseKind === 'inbound' || responseKind.startsWith('response.')) {
    return normalizeTier(row?.serviceTier || row?.service_tier);
  }
  return null;
}

function normalizeTier(value: unknown) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'fast') return 'priority';
  if (text === 'priority' || text === 'default' || text === 'flex') return text;
  return null;
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
  if (status.launch_environment?.status === 'secret_env_present') modes.push('process_only_ephemeral');
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
    configured: Boolean(status.provider_ready ?? status.ok),
    setup_needed: !Boolean(status.provider_ready ?? status.ok),
    upgrade_needed: Boolean(status.selected && status.tool_output_recovery?.ok !== true),
    repair_available: !Boolean(status.provider_ready ?? status.ok),
    api_key: {
      present: Boolean(status.env_key_configured),
      source: status.env_loader?.api_key?.source || null,
      redacted: true
    },
    persistence,
    env_loader: status.env_loader || null,
    env_auto_load: Boolean(status.env_file && status.env_key_configured),
    guidance: status.selected && status.tool_output_recovery?.ok !== true
      ? status.tool_output_recovery.operator_actions || []
      : status.ok ? [] : [
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
  let syncLaunchctl = false;
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
    syncLaunchctl = parseYesNo(await ask('6. Sync non-secret macOS launchctl base URL only? API keys are never stored in launchd. [y/N] '), false);
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
