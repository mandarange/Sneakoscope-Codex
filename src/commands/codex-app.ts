import { flag, readOption } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexAccessTokenStatus, codexAppIntegrationStatus, codexChromeExtensionStatus, codexProductDesignPluginStatus, formatCodexAppStatus, formatCodexProductDesignPluginStatus } from '../core/codex-app.js';
import { codexAppRemoteControlCommand } from '../cli/codex-app-command.js';
import { readStdin, sksRoot } from '../core/fsx.js';
import { buildCodexAppHarnessMatrix } from '../core/codex-app/codex-app-harness-matrix.js';
import { syncCodexSksSkills } from '../core/codex-app/codex-skill-sync.js';
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js';
import { runCodexInitDeep } from '../core/codex-app/codex-init-deep.js';
import { buildCodexHookLifecycle } from '../core/codex-app/codex-hook-lifecycle.js';
import { resolveCodexAppExecutionProfile } from '../core/codex-app/codex-app-execution-profile.js';
import { repairCodexNativeManagedAssets } from '../core/codex-native/codex-native-repair-transaction.js';
import { doctorCodexAppGlmProfile, installCodexAppGlmProfile } from '../core/codex-app/glm-profile-installer.js';
import { openRouterStatus, useOpenRouter } from '../core/codex-app/openrouter-activate.js';
import { OPENROUTER_DEFAULT_MODEL } from '../core/codex-app/openrouter-provider.js';
import { promptForOpenRouterKeyHidden, writeStoredOpenRouterKey } from '../core/providers/openrouter/openrouter-secret-store.js';
import { restartCodexApp } from '../core/codex-app/codex-app-restart.js';

export async function run(_command: any, args: any = []) {
  const action = args[0] || 'check';
  if (action === 'restart') return printCodexAppResult(args, await restartCodexApp());
  if (action === 'remote-control' || action === 'remote') return codexAppRemoteControlCommand(args.slice(1));
  if (action === 'harness-matrix') {
    const root = await sksRoot();
    return printCodexAppResult(args, await maybeRepairThenReadOnlyHarness(args, root));
  }
  if (action === 'skill-sync') return printCodexAppResult(args, await syncCodexSksSkills({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'agent-role-sync') return printCodexAppResult(args, await syncCodexAgentRoles({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'init-deep') return printCodexAppResult(args, await runCodexInitDeep({ root: await sksRoot(), apply: !flag(args, '--check-only') && !flag(args, '--dry-run') }));
  if (action === 'hook-lifecycle') return printCodexAppResult(args, await buildCodexHookLifecycle({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'execution-profile') return printCodexAppResult(args, await resolveCodexAppExecutionProfile({ root: await sksRoot() }));
  if (action === 'glm-profile') {
    const subcommand = args[1] || 'doctor';
    const root = await sksRoot();
    // Legacy Desktop GLM profile surface is retired; install/repair only strips
    // leftover profiles and ensures the OpenRouter provider table.
    const result = subcommand === 'install' || subcommand === 'repair' || subcommand === 'remove'
      ? await installCodexAppGlmProfile({ root, apply: true })
      : await doctorCodexAppGlmProfile({ root });
    return printCodexAppResult(args, result);
  }
  if (action === 'set-openrouter-key' || action === 'openrouter-key') {
    const root = await sksRoot();
    const key = await readOpenRouterKeyFromArgs(args.slice(1));
    if (!key) {
      const result = { schema: 'sks.codex-app-openrouter-key.v1', ok: false, status: 'missing_key', blockers: ['openrouter_key_missing'], warnings: [] };
      return printCodexAppResult(args, result);
    }
    const record = await writeStoredOpenRouterKey(key);
    const profile = await installCodexAppGlmProfile({ root, apply: true });
    // Save-only: do not select OpenRouter as the default provider and do not restart
    // unless explicitly requested (mirrors codex-lb setup --no-default-provider).
    const restart = await restartCodexApp({ enabled: flag(args, '--restart-app') || flag(args, '--restart') });
    const result = {
      schema: 'sks.codex-app-openrouter-key.v1',
      ok: Boolean(profile.ok && restart.ok),
      status: !profile.ok ? 'stored_profile_blocked' : restart.ok ? 'stored' : 'stored_restart_blocked',
      key_preview: record.key_preview,
      raw_key_recorded: false,
      secret_store: 'sks-openrouter-secret-store',
      selected: false,
      glm_profile: profile,
      restart_app: restart,
      blockers: [...(profile.blockers || []), ...(restart.blockers || [])],
      warnings: profile.warnings || []
    };
    return printCodexAppResult(args, result);
  }
  if (action === 'use-openrouter' || action === 'use-or') {
    const root = await sksRoot();
    const model = readOption(args, '--model', OPENROUTER_DEFAULT_MODEL);
    const result = await useOpenRouter({
      root,
      model,
      restartApp: flag(args, '--restart-app') || flag(args, '--restart') || !flag(args, '--no-restart-app')
    });
    return printCodexAppResult(args, result);
  }
  if (action === 'openrouter-status') {
    const result = await openRouterStatus({});
    return printCodexAppResult(args, result);
  }
  if (action === 'product-design' || action === 'design-product' || action === 'ensure-product-design') {
    const checkOnly = flag(args, '--check-only') || flag(args, '--no-install');
    const status = await codexProductDesignPluginStatus({
      autoInstallProductDesign: !checkOnly && (
        action === 'product-design'
        || action === 'design-product'
        || action === 'ensure-product-design'
        || flag(args, '--install')
        || flag(args, '--auto-install')
      )
    });
    if (flag(args, '--json')) {
      printJson(status);
      if (!status.ok) process.exitCode = 1;
      return;
    }
    console.log(formatCodexProductDesignPluginStatus(status));
    if (!status.ok) process.exitCode = 1;
    return;
  }
  if (action === 'chrome-extension' || action === 'chrome') {
    const status = await codexChromeExtensionStatus();
    if (flag(args, '--json')) {
      printJson(status);
      if (!status.ok) process.exitCode = 1;
      return;
    }
    console.log(`Codex Chrome Extension: ${status.ok ? 'available' : status.status}`);
    for (const line of status.guidance || []) console.log(`- ${line}`);
    if (!status.ok) process.exitCode = 1;
    return;
  }
  if (action === 'pat') {
    const status = codexAccessTokenStatus();
    if (flag(args, '--json')) return printJson(status);
    console.log('Codex App PAT status');
    console.log(`Status: ${status.status}`);
    for (const entry of status.access_token_env_vars) console.log(`${entry.name}: ${entry.present ? entry.value : 'missing'}`);
    return;
  }
  if (action === 'check' || action === 'status') {
    const status = await codexAppIntegrationStatus({
      autoInstallProductDesign: flag(args, '--install-product-design') || flag(args, '--auto-install-product-design')
    });
    if (flag(args, '--json')) {
      printJson(status);
      if (!status.ok) process.exitCode = 1;
      return;
    }
    console.log(formatCodexAppStatus(status, { includeRaw: flag(args, '--verbose') }));
    if (!status.ok) process.exitCode = 1;
    return;
  }
  console.error('Usage: sks codex-app check|status|harness-matrix|skill-sync|agent-role-sync|init-deep|hook-lifecycle|execution-profile|set-openrouter-key [--api-key-stdin]|use-openrouter --model <id>|openrouter-status|product-design [--check-only]|ensure-product-design|chrome-extension|pat status|remote-control [--json]');
  console.error('Note: glm-profile is retired (strips leftover Desktop GLM profiles); use set-openrouter-key / use-openrouter.');
  process.exitCode = 1;
}

async function readOpenRouterKeyFromArgs(args: any[] = []): Promise<string> {
  const key = readOption(args, '--api-key', readOption(args, '--key', ''));
  if (key) return String(key).trim();
  if (flag(args, '--api-key-stdin') || flag(args, '--key-stdin')) return String(await readStdin()).trim();
  return await promptForOpenRouterKeyHidden() || '';
}

function printCodexAppResult(args: any[] = [], result: any) {
  if (flag(args, '--json')) {
    printJson(result);
    if (result?.ok === false) process.exitCode = 1;
    return;
  }
  console.log(`${result?.schema || 'sks.codex-app-result'}: ${result?.ok === false ? 'blocked' : 'ok'}`);
  for (const blocker of result?.blockers || []) console.log(`- blocker: ${blocker}`);
  for (const warning of result?.warnings || []) console.log(`- warning: ${warning}`);
  if (result?.ok === false) process.exitCode = 1;
}

async function maybeRepairThenReadOnlyHarness(args: any[] = [], root: string) {
  const wantsRepair = flag(args, '--fix') || flag(args, '--apply') || flag(args, '--repair-codex-native');
  if (!wantsRepair) return buildCodexAppHarnessMatrix({ root, mode: 'read-only' });
  const repair = await repairCodexNativeManagedAssets({ root, requestedBy: 'manual', yes: flag(args, '--yes') });
  const matrix = await buildCodexAppHarnessMatrix({ root, mode: 'read-only' });
  return {
    schema: 'sks.codex-app-harness-read-repair-split.v1',
    ok: repair.ok && matrix?.ok !== false,
    repair,
    matrix,
    blockers: [...(repair.blockers || []), ...(matrix?.blockers || [])],
    warnings: [...(repair.warnings || []), 'harness_probe_after_explicit_repair_transaction']
  };
}
