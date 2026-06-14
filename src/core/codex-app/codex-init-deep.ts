// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export async function runCodexInitDeep(input: { root: string; apply?: boolean } = {}): Promise<any> {
  const root = path.resolve(input.root || process.cwd())
  const dirs = await scoreDirectories(root)
  const selected = dirs.filter((row) => row.score >= 4).slice(0, 12)
  const contextDir = path.join(root, '.sneakoscope', 'context')
  const generatedPath = path.join(contextDir, 'AGENTS.generated.md')
  const markdown = renderGeneratedAgents(selected)
  if (input.apply === true) {
    await ensureDir(contextDir)
    await writeTextAtomic(generatedPath, markdown)
  }
  const report = {
    schema: 'sks.codex-init-deep.v1',
    generated_at: nowIso(),
    ok: true,
    apply: input.apply === true,
    root,
    generated_path: path.relative(root, generatedPath),
    root_agents_preserved: true,
    directory_guidance: selected,
    blockers: []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-init-deep.json'), report).catch(() => undefined)
  return report
}

export async function readInitDeepMemory(root: string): Promise<{ path: string; text: string } | null> {
  const file = path.join(root, '.sneakoscope', 'context', 'AGENTS.generated.md')
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  return text.trim() ? { path: file, text } : null
}

async function scoreDirectories(root: string): Promise<Array<{ dir: string; file_count: number; languages: string[]; score: number; guidance: string }>> {
  const counts = new Map<string, { file_count: number; langs: Set<string> }>()
  await walk(path.join(root, 'src'), root, counts)
  await walk(path.join(root, 'docs'), root, counts)
  const highRisk = [/src\/core\/zellij/, /src\/core\/loops/, /src\/core\/codex-app/, /src\/commands/]
  return [...counts.entries()].map(([dir, value]) => {
    const risky = highRisk.some((re) => re.test(dir))
    const score = Math.min(10, Math.ceil(value.file_count / 6) + value.langs.size + (risky ? 3 : 0))
    return {
      dir,
      file_count: value.file_count,
      languages: [...value.langs].sort(),
      score,
      guidance: risky ? 'High-risk SKS runtime area; hydrate TriWiki/current source before edits.' : 'Use local source conventions and keep changes owner-scoped.'
    }
  }).sort((a, b) => b.score - a.score || a.dir.localeCompare(b.dir))
}

async function walk(dir: string, root: string, counts: Map<string, { file_count: number; langs: Set<string> }>, depth = 0): Promise<void> {
  if (depth > 3) return
  const rows = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const row of rows) {
    const full = path.join(dir, row.name)
    if (row.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(row.name)) await walk(full, root, counts, depth + 1)
    } else if (row.isFile()) {
      const relDir = path.relative(root, path.dirname(full)).split(path.sep).join('/')
      const entry = counts.get(relDir) || { file_count: 0, langs: new Set<string>() }
      entry.file_count += 1
      entry.langs.add(path.extname(row.name).replace(/^\./, '') || 'text')
      counts.set(relDir, entry)
    }
  }
}

function renderGeneratedAgents(rows: any[]) {
  return [
    '# SKS Init-Deep Generated Context',
    '',
    'This file is generated under `.sneakoscope/context` so user-authored `AGENTS.md` files are preserved.',
    '',
    ...rows.flatMap((row) => [
      `## ${row.dir}`,
      '',
      `- Files: ${row.file_count}`,
      `- Languages: ${row.languages.join(', ') || 'unknown'}`,
      `- Guidance: ${row.guidance}`,
      ''
    ])
  ].join('\n')
}
