#!/usr/bin/env node

const FAST_PACKAGE_VERSION = '5.9.0';
const args = process.argv.slice(2);

try {
  if (args[0] === '--agent' && args[1] === 'worker') {
    const { runNativeCliWorkerFromArgs } = await import('../core/agents/native-cli-worker.js');
    await runNativeCliWorkerFromArgs(args.slice(2));
  } else if (args[0] === '--version' || args[0] === '-v' || args[0] === 'version') {
    console.log(`sneakoscope ${FAST_PACKAGE_VERSION}`);
  } else if (args[0] === 'commands' && args.includes('--json')) {
    const { commandsJsonFast } = await import('../cli/commands-fast.js');
    commandsJsonFast();
  } else if (args[0] === 'root' && args.includes('--json')) {
    const getBuiltinModule = (process as unknown as { getBuiltinModule?: (name: string) => any }).getBuiltinModule;
    const fs = typeof getBuiltinModule === 'function' ? getBuiltinModule('node:fs') : await import('node:fs');
    rootJsonFastInline(fs);
  } else if (args[0] === 'super-search' && args[1] === 'doctor') {
    const { buildSuperSearchDoctorReport, printSuperSearchDoctorReport } = await import('../core/super-search/doctor.js');
    const doctorArgs = args.slice(2);
    printSuperSearchDoctorReport(buildSuperSearchDoctorReport(doctorArgs), doctorArgs.includes('--json'));
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    if (args.length > 1) {
      const { helpCommand } = await import('../core/commands/basic-cli.js');
      await (helpCommand as (args: string[]) => Promise<unknown> | unknown)(args.slice(1));
    } else {
      const { helpFast } = await import('../cli/help-fast.js');
      helpFast();
    }
  } else {
    const { main } = await import('../cli/main.js');
    await main(args);
  }
} catch (err: unknown) {
  const message = err instanceof Error && err.stack ? err.stack : String(err);
  console.error(message);
  process.exitCode = 1;
}

function rootJsonFastInline(fs: { existsSync(path: string): boolean }, cwd = process.cwd()): void {
  const project = findProjectRootSync(fs, cwd);
  const global = joinPath(process.env.HOME || process.env.USERPROFILE || cwd, '.sneakoscope');
  const active = project || global;
  process.stdout.write(`${JSON.stringify({
    cwd,
    mode: project ? 'project' : 'global',
    active_root: active,
    project_root: project,
    global_root: global,
    using_global_root: !project
  })}\n`);
}

function findProjectRootSync(fs: { existsSync(path: string): boolean }, start: string): string | null {
  let dir = normalizeStart(start);
  for (;;) {
    if (fs.existsSync(joinPath(dir, '.sneakoscope'))) return dir;
    if (fs.existsSync(joinPath(dir, 'AGENTS.md')) && fs.existsSync(joinPath(dir, 'package.json'))) return dir;
    const parent = parentDir(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeStart(start: string): string {
  const value = stripTrailingSlash(start || process.cwd());
  if (value.startsWith('/')) return value || '/';
  return joinPath(process.cwd(), value);
}

function joinPath(left: string, right: string): string {
  const base = stripTrailingSlash(left || '/');
  return `${base === '/' ? '' : base}/${right}`;
}

function parentDir(value: string): string {
  const dir = stripTrailingSlash(value);
  if (dir === '/') return dir;
  const index = dir.lastIndexOf('/');
  return index <= 0 ? '/' : dir.slice(0, index);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '') || '/';
}
