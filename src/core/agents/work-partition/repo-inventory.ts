import fs from 'node:fs/promises'
import path from 'node:path'

const IGNORE = new Set([
  '.agents', '.cache', '.claude', '.codex', '.git', '.git-worktrees', '.hg', '.mypy_cache', '.next', '.npm', '.nuxt',
  '.nyc_output', '.parcel-cache', '.pnpm-store', '.pytest_cache', '.ruff_cache', '.sneakoscope', '.svelte-kit', '.svn',
  '.tmp', '.turbo', '.venv', '.worktrees', '.yarn', '__pycache__', 'build', 'coverage', 'dist', 'logs', 'node_modules',
  'out', 'target', 'temp', 'tmp', 'venv'
])
const PRIORITY_DIRS = ['src', 'test', 'docs', 'schemas', 'scripts', 'crates', 'bin']
const REPRESENTATIVE_DIRS = ['src', 'test', 'docs']
const CORE_FILES = ['package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'tsconfig.json', 'release-gates.v2.json', 'runtime-required-scripts.json', 'AGENTS.md']

export async function collectRepoInventory(root: string, opts: { maxFiles?: number } = {}) {
  const files: string[] = []
  const seen = new Set<string>()
  const requestedMax = Number(opts.maxFiles ?? process.env.SKS_AGENT_REPO_INVENTORY_MAX_FILES ?? 10000)
  const maxFiles = Number.isFinite(requestedMax) ? Math.max(1, Math.floor(requestedMax)) : 10000
  const add = (file: string) => {
    if (files.length >= maxFiles || seen.has(file)) return
    seen.add(file)
    files.push(file)
  }

  // Seed representative source/test/docs entries before any large tree can
  // exhaust the cap, then expand the priority roots in a stable order.
  for (const name of REPRESENTATIVE_DIRS) {
    const representative = await firstFile(root, path.join(root, name))
    if (representative) add(representative)
  }
  for (const name of CORE_FILES) {
    const full = path.join(root, name)
    if ((await fs.stat(full).catch(() => null))?.isFile()) add(name)
  }
  for (const name of PRIORITY_DIRS) await walk(root, path.join(root, name), files, seen, maxFiles)

  for (const entry of await sortedEntries(root)) {
    if (files.length >= maxFiles) break
    if (IGNORE.has(entry.name) || PRIORITY_DIRS.includes(entry.name) || CORE_FILES.includes(entry.name)) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) await walk(root, full, files, seen, maxFiles)
    else if (entry.isFile()) add(entry.name)
  }
  const classify = (re: RegExp) => files.filter((file) => re.test(file))
  return {
    schema: 'sks.agent-repo-inventory.v1',
    root,
    total_files: files.length,
    source_files: classify(/^(?:src|bin|crates)\//),
    tests: classify(/^test\//),
    docs: classify(/^(?:docs\/|README\.md|CHANGELOG\.md)/),
    schemas: classify(/^schemas\//),
    scripts: classify(/^scripts\//),
    generated_files: classify(/^(?:dist|\.sneakoscope|\.codex|\.agents)\//),
    protected_sks_core: classify(/^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)/),
    files
  }
}

async function walk(root: string, dir: string, out: string[], seen: Set<string>, maxFiles: number): Promise<void> {
  if (out.length >= maxFiles) return
  for (const entry of await sortedEntries(dir)) {
    if (out.length >= maxFiles) return
    if (IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full).replace(/\\/g, '/')
    if (entry.isDirectory()) await walk(root, full, out, seen, maxFiles)
    else if (entry.isFile() && !seen.has(rel)) {
      seen.add(rel)
      out.push(rel)
    }
  }
}

async function firstFile(root: string, dir: string): Promise<string | null> {
  for (const entry of await sortedEntries(dir)) {
    if (IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isFile()) return path.relative(root, full).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      const nested = await firstFile(root, full)
      if (nested) return nested
    }
  }
  return null
}

async function sortedEntries(dir: string) {
  return (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
