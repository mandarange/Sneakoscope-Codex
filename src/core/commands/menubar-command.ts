import path from 'node:path';
import { projectRoot } from '../fsx.js';
import {
  inspectSksMenuBarStatus,
  installSksMenuBar,
  restartSksMenuBar,
  uninstallSksMenuBar
} from '../codex-app/sks-menubar.js';

export async function menubarCommand(subcommand = 'status', args: string[] = []) {
  const action = normalizeAction(subcommand);
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()));
  const home = stringOption(args, '--home');
  if (action === 'status') {
    const result = await inspectSksMenuBarStatus({ root, ...(home ? { home } : {}) });
    if (flag(args, '--json')) return printJson(result);
    printStatus(result);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'install') {
    const result = await installSksMenuBar({ root, ...(home ? { home } : {}), apply: true, launch: !flag(args, '--no-launch') });
    if (flag(args, '--json')) return printJson(result);
    console.log(`SKS menu bar install: ${result.status}`);
    for (const actionLine of result.actions) console.log(`- ${actionLine}`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
    for (const blocker of result.blockers) console.log(`blocker: ${blocker}`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'restart') {
    const result = await restartSksMenuBar({ root, ...(home ? { home } : {}) });
    if (flag(args, '--json')) return printJson(result);
    console.log(`SKS menu bar restart: ${result.ok ? 'ok' : 'failed'}`);
    if ('error' in result && result.error) console.log(`error: ${result.error}`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'uninstall') {
    const result = await uninstallSksMenuBar({ root, ...(home ? { home } : {}) });
    if (flag(args, '--json')) return printJson(result);
    console.log(`SKS menu bar uninstall: ${result.ok ? 'ok' : 'failed'}`);
    for (const actionLine of result.actions) console.log(`- ${actionLine}`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
    for (const blocker of result.blockers) console.log(`blocker: ${blocker}`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  printUsage();
  process.exitCode = 2;
}

function normalizeAction(value: unknown): 'status' | 'install' | 'restart' | 'uninstall' | 'help' {
  const text = String(value || 'status').toLowerCase();
  if (['status', 'inspect', 'doctor'].includes(text)) return 'status';
  if (['install', 'fix', 'repair'].includes(text)) return 'install';
  if (['restart', 'reload'].includes(text)) return 'restart';
  if (['uninstall', 'remove', 'disable'].includes(text)) return 'uninstall';
  return 'help';
}

function printStatus(result: Awaited<ReturnType<typeof inspectSksMenuBarStatus>>) {
  console.log('SKS menu bar');
  console.log(`Installed: ${result.installed ? 'yes' : 'no'}`);
  console.log(`Running:   ${result.running ? 'yes' : 'no'}`);
  console.log(`Launchd:   ${result.launchd.ok ? result.launchd.state || 'present' : result.launchd.error || 'missing'}`);
  console.log(`Version:   ${result.build_stamp?.package_version || 'unknown'} (package ${result.package_version})`);
  console.log(`Target:    ${result.action_target.sks_entry || 'missing'} ${result.action_target.sks_entry_exists ? '(ok)' : '(missing)'}`);
  console.log(`Signature: ${result.signature.identifier || 'unknown'} ${result.signature.ok ? '(ok)' : '(check)'}`);
  if (result.warnings.length) {
    console.log('Warnings:');
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
  if (result.blockers.length) {
    console.log('Blockers:');
    for (const blocker of result.blockers) console.log(`- ${blocker}`);
  }
  if (result.next_actions.length) {
    console.log('Next actions:');
    for (const action of result.next_actions) console.log(`- ${action}`);
  }
}

function printUsage() {
  console.log(`SKS Menu Bar

Usage:
  sks menubar status [--json]
  sks menubar install [--no-launch] [--json]
  sks menubar restart [--json]
  sks menubar uninstall [--json]
`);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function flag(args: string[] = [], name: string): boolean {
  return args.includes(name);
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function stringOption(args: string[] = [], name: string): string | null {
  const value = readOption(args, name, null);
  const text = value == null ? '' : String(value).trim();
  return text || null;
}
