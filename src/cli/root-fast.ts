import fs from 'node:fs';

export function rootJsonFast(cwd = process.cwd()): void {
  const project = findProjectRootSync(cwd);
  const global = joinPath(process.env.HOME || process.env.USERPROFILE || cwd, '.sneakoscope');
  const active = project || global;
  console.log(JSON.stringify({
    cwd,
    mode: project ? 'project' : 'global',
    active_root: active,
    project_root: project,
    global_root: global,
    using_global_root: !project
  }, null, 2));
}

function findProjectRootSync(start: string): string | null {
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
