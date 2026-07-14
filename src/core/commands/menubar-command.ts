import path from 'node:path';
import { ui as cliUi } from '../../cli/cli-theme.js';
import { projectRoot } from '../fsx.js';
import {
  inspectSksMenuBarStatus,
  installSksMenuBar,
  restartSksMenuBar,
  uninstallSksMenuBar
} from '../codex-app/sks-menubar.js';
import {
  addCodexMcpServer,
  listCodexMcpServers,
  removeCodexMcpServer,
  setCodexMcpServerEnabled
} from '../codex-app/mcp-manager.js';

export async function menubarCommand(subcommand = 'status', args: string[] = []) {
  if (String(subcommand || '').toLowerCase() === 'mcp') return menubarMcpCommand(args);
  const action = normalizeAction(subcommand);
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()));
  const home = stringOption(args, '--home');
  if (action === 'status') {
    const result = await inspectSksMenuBarStatus({ root, ...(home ? { home } : {}) });
    if (flag(args, '--json')) return printJson(result);
    cliUi.banner('menubar status');
    if (result.ok) cliUi.ok(result.running ? 'running' : 'installed status checked');
    else cliUi.warn('needs attention');
    printStatus(result);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'install') {
    const result = await installSksMenuBar({ root, ...(home ? { home } : {}), apply: true, launch: !flag(args, '--no-launch'), quiet: flag(args, '--json') });
    if (flag(args, '--json')) return printJson(result);
    cliUi.banner('menubar install');
    if (result.ok) cliUi.ok(result.status);
    else cliUi.fail(result.status);
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
    cliUi.banner('menubar restart');
    if (result.ok) cliUi.ok('restart requested');
    else cliUi.fail('restart failed');
    console.log(`SKS menu bar restart: ${result.ok ? 'ok' : 'failed'}`);
    if ('error' in result && result.error) console.log(`error: ${result.error}`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'uninstall') {
    const result = await uninstallSksMenuBar({ root, ...(home ? { home } : {}) });
    if (flag(args, '--json')) return printJson(result);
    cliUi.banner('menubar uninstall');
    if (result.ok) cliUi.ok('uninstall complete');
    else cliUi.fail('uninstall failed');
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

async function menubarMcpCommand(args: string[] = []) {
  const action = String(args[0] || 'list').toLowerCase();
  const rest = args.slice(1);
  const home = stringOption(rest, '--home');
  const options = home ? { home } : {};
  let result: any;
  if (['list', 'status', 'refresh'].includes(action)) {
    result = await listCodexMcpServers(options);
  } else if (action === 'add') {
    const payload = flag(rest, '--stdin-json') ? await readStdinJson() : null;
    result = await addCodexMcpServer(payload, options);
  } else if (action === 'remove') {
    result = await removeCodexMcpServer(stringOption(rest, '--name') || positional(rest), options);
  } else if (action === 'enable' || action === 'disable') {
    result = await setCodexMcpServerEnabled(stringOption(rest, '--name') || positional(rest), action === 'enable', options);
  } else {
    printMcpUsage();
    process.exitCode = 2;
    return;
  }
  if (flag(rest, '--json') || flag(args, '--json')) printJson(result);
  else printMcpResult(result);
  if (result?.ok !== true) process.exitCode = 1;
  return result;
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
  console.log(`Target:    ${result.action_target.sks_entry || 'runtime'} ${result.action_target.ok ? '(smoke ok)' : '(smoke failed)'}`);
  console.log(`Codex sync:${result.codex_sync.bundle_id || 'disabled'} ${result.codex_sync.codex_running === null ? '' : result.codex_sync.codex_running ? '(running)' : '(not running)'}`);
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
  sks menubar mcp list [--json]
  sks menubar mcp add --stdin-json [--json]
  sks menubar mcp enable|disable|remove <name> [--json]
`);
}

function printMcpUsage() {
  console.log(`SKS Menu Bar MCP Manager

Usage:
  sks menubar mcp list [--json]
  sks menubar mcp add --stdin-json [--json]
  sks menubar mcp enable <name> [--json]
  sks menubar mcp disable <name> [--json]
  sks menubar mcp remove <name> [--json]
`);
}

function printMcpResult(result: any) {
  if (result?.schema === 'sks.menubar-mcp-list.v1') {
    console.log(`Codex MCP servers (${result.server_count || 0})`);
    for (const server of result.servers || []) console.log(`- ${server.enabled ? 'on ' : 'off'} ${server.name}: ${server.summary}`);
    return;
  }
  console.log(`Codex MCP ${result?.action || 'mutation'}: ${result?.ok ? 'ok' : 'failed'}`);
  for (const blocker of result?.blockers || []) console.log(`blocker: ${blocker}`);
}

async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1024 * 1024) throw new Error('menubar_mcp_stdin_payload_too_large');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function positional(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    if (arg === '--home' || arg === '--name') {
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) return arg;
  }
  return null;
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
