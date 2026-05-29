#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const report = await mod.launchMadZellijUi(['--workspace', 'sks-mad-check'], { root, missionId: 'M-zellij-launch-check', ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'agents'), dryRun: true });
const paneProofExists = await fs.access(path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'zellij-pane-proof.json')).then(() => true).catch(() => false);
const installHelpers = await fs.readFile(path.join(root, 'src', 'cli', 'install-helpers.ts'), 'utf8');
const madCommand = await fs.readFile(path.join(root, 'src', 'core', 'commands', 'mad-sks-command.ts'), 'utf8');
const installSafetyOk = !installHelpers.includes("--from-postinstall', '--install-scope', 'global', '--force', '--yes")
  && installHelpers.includes('SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS')
  && installHelpers.includes('(zellijRepair as any).error || zellij.blockers[0]')
  && installHelpers.includes('Codex CLI is missing. Install latest Codex CLI');
const consoleDetailOk = madCommand.includes("['stderr_tail'")
  && madCommand.includes("['stdout_tail'")
  && madCommand.includes('report: ${launch.report_path}');
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
  && consoleDetailOk;
const gate = { schema: 'sks.mad-sks-zellij-launch-check.v1', ok, install_safety_ok: installSafetyOk, console_detail_ok: consoleDetailOk, report };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'mad-sks-zellij-launch.json'), `${JSON.stringify(gate, null, 2)}\n`);
emit(gate);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-zellij-launch-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
