import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexAccessTokenStatus, codexAppIntegrationStatus, codexChromeExtensionStatus, codexProductDesignPluginStatus, formatCodexAppStatus, formatCodexProductDesignPluginStatus } from '../core/codex-app.js';
import { codexAppRemoteControlCommand } from '../cli/codex-app-command.js';

export async function run(_command: any, args: any = []) {
  const action = args[0] || 'check';
  if (action === 'remote-control' || action === 'remote') return codexAppRemoteControlCommand(args.slice(1));
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
  console.error('Usage: sks codex-app check|status|product-design [--check-only]|ensure-product-design|chrome-extension|pat status|remote-control [--json]');
  process.exitCode = 1;
}
