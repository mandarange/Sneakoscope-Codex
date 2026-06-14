import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexAccessTokenStatus, codexAppIntegrationStatus, codexChromeExtensionStatus, codexProductDesignPluginStatus, formatCodexAppStatus, formatCodexProductDesignPluginStatus } from '../core/codex-app.js';
import { codexAppRemoteControlCommand } from '../cli/codex-app-command.js';
import { sksRoot } from '../core/fsx.js';
import { buildCodexAppHarnessMatrix } from '../core/codex-app/codex-app-harness-matrix.js';
import { syncCodexSksSkills } from '../core/codex-app/codex-skill-sync.js';
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js';
import { runCodexInitDeep } from '../core/codex-app/codex-init-deep.js';
import { buildCodexHookLifecycle } from '../core/codex-app/codex-hook-lifecycle.js';
import { resolveCodexAppExecutionProfile } from '../core/codex-app/codex-app-execution-profile.js';
import { buildLazyCodexInteropPolicy } from '../core/codex-app/lazycodex-interop-policy.js';

export async function run(_command: any, args: any = []) {
  const action = args[0] || 'check';
  if (action === 'remote-control' || action === 'remote') return codexAppRemoteControlCommand(args.slice(1));
  if (action === 'harness-matrix') return printCodexAppResult(args, await buildCodexAppHarnessMatrix({ root: await sksRoot(), applyRepairs: flag(args, '--fix') || flag(args, '--apply') }));
  if (action === 'skill-sync') return printCodexAppResult(args, await syncCodexSksSkills({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'agent-role-sync') return printCodexAppResult(args, await syncCodexAgentRoles({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'init-deep') return printCodexAppResult(args, await runCodexInitDeep({ root: await sksRoot(), apply: !flag(args, '--check-only') && !flag(args, '--dry-run') }));
  if (action === 'hook-lifecycle') return printCodexAppResult(args, await buildCodexHookLifecycle({ root: await sksRoot(), apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'execution-profile') return printCodexAppResult(args, await resolveCodexAppExecutionProfile({ root: await sksRoot() }));
  if (action === 'interop' && args[1] === 'lazycodex') {
    const modeArg = readOption(args, '--mode', 'coexist');
    const mode = modeArg === 'sks-primary' || modeArg === 'handoff-to-omo' ? modeArg : 'coexist';
    return printCodexAppResult(args, await buildLazyCodexInteropPolicy({ root: await sksRoot(), mode }));
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
  console.error('Usage: sks codex-app check|status|harness-matrix|skill-sync|agent-role-sync|init-deep|hook-lifecycle|execution-profile|interop lazycodex [--mode coexist]|product-design [--check-only]|ensure-product-design|chrome-extension|pat status|remote-control [--json]');
  process.exitCode = 1;
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

function readOption(args: any[] = [], name: string, fallback: string) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
}
