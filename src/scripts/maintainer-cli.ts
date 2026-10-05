#!/usr/bin/env node
// Maintainer-only commands: SKS's own release proof, gate runner, benchmarks,
// version metadata and feature registry. They are not part of the shipped `sks`
// CLI: dist/scripts is not packaged, so users and agent hosts never see them.
//
//   npm run maintainer -- <command> [args]
//   node dist/scripts/maintainer-cli.js <command> [args]
import { pathToFileURL } from 'node:url';
import { argsCommand, directCommand, subcommand, type CommandModule } from '../cli/command-loaders.js';

export interface MaintainerCommand {
  summary: string;
  usage: string;
  lazy: () => Promise<CommandModule>;
}

export const MAINTAINER_COMMANDS = {
  check: {
    summary: 'Run five-minute proof-bank affected checks',
    usage: 'maintainer check --tier instant|affected|confidence|release|real-check [--sla 5m] [--changed-since auto] [--json]',
    lazy: argsCommand(() => import('../core/commands/check-command.js'), 'checkCommand')
  },
  gates: {
    summary: 'Run release gate DAG by gate id or preset',
    usage: 'maintainer gates [options]',
    lazy: argsCommand(() => import('../core/commands/gates-command.js'), 'gatesCommand')
  },
  task: {
    summary: 'Run an SLA-bounded SKS task check',
    usage: 'maintainer task run [--sla 5m] [--json]',
    lazy: argsCommand(() => import('../core/commands/task-command.js'), 'taskCommand')
  },
  release: {
    summary: 'Run affected/full/background release gates',
    usage: 'maintainer release affected|full|background|stage [--json]',
    lazy: argsCommand(() => import('../core/commands/release-command.js'), 'releaseCommand')
  },
  daemon: {
    summary: 'Inspect or warm the local SKS daemon cache',
    usage: 'maintainer daemon status|warm|stop [--json]',
    lazy: argsCommand(() => import('../core/commands/daemon-command.js'), 'daemonCommand')
  },
  versioning: {
    summary: 'Manage release version metadata',
    usage: 'maintainer versioning status|bump|disable [--json]',
    lazy: directCommand(() => import('../commands/versioning.js'))
  },
  bench: {
    summary: 'Run core trust-kernel benchmark budgets',
    usage: 'maintainer bench core|route-fixtures|blackbox|trust-kernel [--json]',
    lazy: argsCommand(() => import('../core/commands/bench-command.js'), 'benchCommand')
  },
  perf: {
    summary: 'Run performance checks',
    usage: 'maintainer perf run|workflow|cold-start [--json] [--iterations N]',
    lazy: directCommand(() => import('../commands/perf.js'))
  },
  harness: {
    summary: 'Run harness fixtures',
    usage: 'maintainer harness fixture|review [--json]',
    lazy: subcommand(() => import('../core/commands/harness-command.js'), 'harnessCommand', 'fixture')
  },
  'all-features': {
    summary: 'Run all-features selftest',
    usage: 'maintainer all-features selftest --mock [--json]',
    lazy: directCommand(() => import('../commands/all-features.js'))
  },
  features: {
    summary: 'Validate feature registry',
    usage: 'maintainer features list|check|inventory [--json] [--write-docs]',
    lazy: directCommand(() => import('../commands/features.js'))
  },
  rust: {
    summary: 'Inspect optional Rust accelerator status and smoke parity',
    usage: 'maintainer rust status|smoke [--json] [--require-native]',
    lazy: directCommand(() => import('../commands/rust.js'))
  }
} as const satisfies Record<string, MaintainerCommand>;

export type MaintainerCommandName = keyof typeof MAINTAINER_COMMANDS;

export function maintainerCommandNames(): MaintainerCommandName[] {
  return (Object.keys(MAINTAINER_COMMANDS) as MaintainerCommandName[]).sort();
}

function isMaintainerCommand(name: string): name is MaintainerCommandName {
  return Object.hasOwn(MAINTAINER_COMMANDS, name);
}

function isHelpRequest(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h') || String(args[0] || '').toLowerCase() === 'help';
}

function listCommands(): string {
  const width = Math.max(...maintainerCommandNames().map((name) => name.length));
  return [
    'Usage: npm run maintainer -- <command> [args]',
    '',
    'Maintainer commands (not part of the shipped sks CLI):',
    ...maintainerCommandNames().map((name) => `  ${name.padEnd(width)}  ${MAINTAINER_COMMANDS[name].summary}`),
    '',
    'Run `npm run maintainer -- <command> --help` for that command\'s usage.'
  ].join('\n');
}

export async function runMaintainerCli(argv: readonly string[]): Promise<unknown> {
  const [name = '', ...rest] = argv;
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(listCommands());
    return { ok: true, status: 'help' };
  }
  if (!isMaintainerCommand(name)) {
    console.error(`Unknown maintainer command: ${name}`);
    console.error(listCommands());
    process.exitCode = 1;
    const result = { ok: false, status: 'blocked', command: name, reason: 'unknown_maintainer_command' };
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    return result;
  }
  const command = MAINTAINER_COMMANDS[name];
  const mod = await command.lazy();
  if (isHelpRequest(rest)) {
    console.log(typeof mod.usage === 'function' ? mod.usage(name) : `Usage: ${command.usage}\n\n${command.summary}`);
    return { ok: true, status: 'help', command: name };
  }
  const result = await mod.run(name, rest as string[]);
  if (argv.includes('--json') && result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
    const current = Number(process.exitCode || 0);
    if (!Number.isFinite(current) || current === 0) process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMaintainerCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
