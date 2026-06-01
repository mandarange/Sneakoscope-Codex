#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const report = await mod.launchMadZellijUi(['--workspace', 'sks-mad-check'], {
  root,
  missionId: 'M-zellij-launch-check',
  ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'agents'),
  dryRun: true,
  codexArgs: ['--profile', 'sks-mad-high', '--sandbox', 'danger-full-access', '--ask-for-approval', 'never', '-c', 'service_tier=fast', '-c', 'model_provider="codex-lb"'],
  launchEnv: { SKS_MAD_SKS_TARGET_ROOT: root, SKS_PROTECTED_CORE_POLICY: path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'mad-sks-protected-core-policy.json') }
});
const paneProofExists = await fs.access(path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'zellij-pane-proof.json')).then(() => true).catch(() => false);
const layoutText = await fs.readFile(report.layout_path, 'utf8');
const installHelpers = await fs.readFile(path.join(root, 'src', 'cli', 'install-helpers.ts'), 'utf8');
const madCommand = await fs.readFile(path.join(root, 'src', 'core', 'commands', 'mad-sks-command.ts'), 'utf8');
const installSafetyOk = !installHelpers.includes("--from-postinstall', '--install-scope', 'global', '--force', '--yes")
  && installHelpers.includes('SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS')
  && installHelpers.includes('(zellijRepair as any).error || zellij.blockers[0]')
  && installHelpers.includes('Codex CLI is missing. Install latest Codex CLI');
const consoleDetailOk = madCommand.includes("['stderr_tail'")
  && madCommand.includes("['stdout_tail'")
  && madCommand.includes('report: ${launch.report_path}');
const autoAttachOk = madCommand.includes('shouldAutoAttachZellij(args)')
  && madCommand.includes('attachZellijSessionInteractive(launch.session_name')
  && madCommand.includes("list.includes('--no-attach')")
  && madCommand.includes("list.includes('--json')")
  && madCommand.includes('process.env.ZELLIJ')
  && madCommand.includes("list.includes('--attach')")
  && madCommand.includes('process.stdout.isTTY && process.stdin.isTTY');
const codexPaneChecks = {
  main_pane_kind: report.main_pane_kind === 'codex_interactive',
  report_enabled: report.codex_pane?.enabled === true,
  report_profile_arg: report.codex_pane.args.includes('--profile') && report.codex_pane.args.includes('sks-mad-high'),
  report_sandbox_arg: report.codex_pane.args.includes('--sandbox') && report.codex_pane.args.includes('danger-full-access'),
  report_approval_arg: report.codex_pane.args.includes('--ask-for-approval') && report.codex_pane.args.includes('never'),
  report_service_tier_arg: report.codex_pane.args.includes('service_tier=fast'),
  report_provider_arg: report.codex_pane.args.some((arg) => /model_provider=.*codex-lb/.test(arg)),
  report_target_env: report.codex_pane.launch_env_keys.includes('SKS_MAD_SKS_TARGET_ROOT'),
  report_policy_env: report.codex_pane.launch_env_keys.includes('SKS_PROTECTED_CORE_POLICY'),
  layout_orchestrator_pane: layoutText.includes('pane name="orchestrator" command="sh"'),
  layout_codex_exec: /exec\s+'?codex'?/.test(layoutText),
  layout_profile_arg: layoutText.includes('--profile') && layoutText.includes('sks-mad-high'),
  layout_sandbox_arg: layoutText.includes('--sandbox') && layoutText.includes('danger-full-access'),
  layout_approval_arg: layoutText.includes('--ask-for-approval') && layoutText.includes('never'),
  layout_service_tier_arg: layoutText.includes('service_tier=fast'),
  layout_provider_arg: /model_provider=.*codex-lb/.test(layoutText),
  layout_not_status_shell: !layoutText.includes('sks status --json || true; exec')
};
const codexPaneOk = Object.values(codexPaneChecks).every(Boolean);
const clipboardCliOk = report.launch_command.includes('--copy-command')
  && report.launch_command.includes('pbcopy')
  && report.launch_command.includes('--copy-on-select')
  && report.launch_command.includes('true')
  && !report.launch_command.includes('--copy-clipboard');
const ok = report.kind === 'mad'
  && report.layout_artifact
  && report.layout_path
  && report.pane_proof_path
  && paneProofExists
  && Array.isArray(report.launch_command)
  && report.launch_command.join(' ').includes('attach --create-background')
  && report.launch_command.includes('--default-layout')
  && !report.launch_command.includes('--layout')
  && !JSON.stringify(report).includes('tmux attach')
  && installSafetyOk
  && consoleDetailOk
  && autoAttachOk
  && clipboardCliOk
  && codexPaneOk;
const gate = { schema: 'sks.mad-sks-zellij-launch-check.v1', ok, install_safety_ok: installSafetyOk, console_detail_ok: consoleDetailOk, auto_attach_ok: autoAttachOk, clipboard_cli_ok: clipboardCliOk, codex_pane_ok: codexPaneOk, codex_pane_checks: codexPaneChecks, report };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'mad-sks-zellij-launch.json'), `${JSON.stringify(gate, null, 2)}\n`);
emit(gate);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-zellij-launch-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
