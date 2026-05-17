import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { codexAccessTokenStatus, codexAppIntegrationStatus, formatCodexAppStatus } from '../core/codex-app.mjs';
import { codexAppRemoteControlCommand } from '../cli/codex-app-command.mjs';

export async function run(_command, args = []) {
  const action = args[0] || 'check';
  if (action === 'remote-control' || action === 'remote') return codexAppRemoteControlCommand(args.slice(1));
  if (action === 'pat') {
    const status = codexAccessTokenStatus();
    if (flag(args, '--json')) return printJson(status);
    console.log('Codex App PAT status');
    console.log(`Status: ${status.status}`);
    for (const entry of status.access_token_env_vars) console.log(`${entry.name}: ${entry.present ? entry.value : 'missing'}`);
    return;
  }
  if (action === 'check' || action === 'status') {
    const status = await codexAppIntegrationStatus();
    if (flag(args, '--json')) {
      printJson(status);
      if (!status.ok) process.exitCode = 1;
      return;
    }
    console.log(formatCodexAppStatus(status, { includeRaw: flag(args, '--verbose') }));
    if (!status.ok) process.exitCode = 1;
    return;
  }
  console.error('Usage: sks codex-app check|status|pat status|remote-control [--json]');
  process.exitCode = 1;
}
