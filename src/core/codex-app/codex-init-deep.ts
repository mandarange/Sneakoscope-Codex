import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, mergeManagedBlock, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

interface DirectoryScore {
  dir: string
  file_count: number
  languages: string[]
  score: number
  guidance: string
}

export interface InitDeepMemoryHint {
  path: string
  scope: string
  summary: string
}

interface DirectoryLocalAgentsReport {
  created: string[]
  updated: string[]
  skipped: string[]
  backup_paths: string[]
  blockers: string[]
}

interface CodexInitDeepReport {
  schema: 'sks.codex-init-deep.v1'
  generated_at: string
  ok: boolean
  apply: boolean
  root: string
  generated_path: string
  root_agents_preserved: boolean
  directory_guidance: DirectoryScore[]
  directory_local_agents: DirectoryLocalAgentsReport
  blockers: string[]
}

export async function runCodexInitDeep(input: { root?: string; apply?: boolean; directoryLocal?: boolean } = {}): Promise<CodexInitDeepReport> {
  const root = path.resolve(input.root || process.cwd())
  const dirs = await scoreDirectories(root)
  const selected = dirs.filter((row) => row.score >= 4).slice(0, 12)
  const contextDir = path.join(root, '.sneakoscope', 'context')
  const generatedPath = path.join(contextDir, 'AGENTS.generated.md')
  const markdown = renderGeneratedAgents(selected)
  const directoryLocalAgents: DirectoryLocalAgentsReport = { created: [], updated: [], skipped: [], backup_paths: [], blockers: [] }
  if (input.apply === true) {
    await ensureDir(contextDir)
    await writeTextAtomic(generatedPath, markdown)
    if (input.directoryLocal === true) {
      for (const row of selected) {
        const agentsPath = path.join(root, row.dir, 'AGENTS.md')
        try {
          await ensureDir(path.dirname(agentsPath))
          const existing = await fs.readFile(agentsPath, 'utf8').catch(() => '')
          if (existing.trim()) {
            const backup = `${agentsPath}.sks-backup-${Date.now()}`
            await fs.copyFile(agentsPath, backup)
            directoryLocalAgents.backup_paths.push(path.relative(root, backup))
          }
          const status = await mergeManagedBlock(agentsPath, 'SKS INIT-DEEP MANAGED SECTION', renderDirectoryAgentsBlock(row))
          if (status === 'created') directoryLocalAgents.created.push(path.relative(root, agentsPath))
          else directoryLocalAgents.updated.push(path.relative(root, agentsPath))
        } catch (err) {
          directoryLocalAgents.skipped.push(path.relative(root, agentsPath))
          directoryLocalAgents.blockers.push(`${path.relative(root, agentsPath)}:${messageOf(err)}`)
        }
      }
    }
  }
  const report: CodexInitDeepReport = {
    schema: 'sks.codex-init-deep.v1',
    generated_at: nowIso(),
    ok: directoryLocalAgents.blockers.length === 0,
    apply: input.apply === true,
    root,
    generated_path: path.relative(root, generatedPath),
    root_agents_preserved: true,
    directory_guidance: selected,
    directory_local_agents: directoryLocalAgents,
    blockers: directoryLocalAgents.blockers
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-init-deep.json'), report).catch(() => undefined)
  return report
}

export async function readInitDeepMemory(root: string): Promise<{ path: string; text: string } | null> {
  const file = path.join(root, '.sneakoscope', 'context', 'AGENTS.generated.md')
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  return text.trim() ? { path: file, text } : null
}

export async function readInitDeepMemoryHints(root: string, scopePaths: string[] = []): Promise<InitDeepMemoryHint[]> {
  const resolvedRoot = path.resolve(root)
  const hints: InitDeepMemoryHint[] = []
  const generated = await readInitDeepMemory(resolvedRoot).catch(() => null)
  if (generated) {
    hints.push({
      path: path.relative(resolvedRoot, generated.path),
      scope: '.',
      summary: generated.text.split(/\r?\n/).filter((line) => /^##\s+/.test(line)).slice(0, 8).join(' | ')
    })
  }
  const candidateDirs = new Set<string>()
  for (const scopePath of scopePaths) {
    const absolute = path.resolve(resolvedRoot, scopePath)
    if (!absolute.startsWith(resolvedRoot)) continue
    const stat = await fs.stat(absolute).catch(() => null)
    let dir = stat?.isFile() ? path.dirname(absolute) : absolute
    while (dir.startsWith(resolvedRoot)) {
      candidateDirs.add(dir)
      if (dir === resolvedRoot) break
      dir = path.dirname(dir)
    }
  }
  for (const dir of [...candidateDirs].sort((a, b) => b.length - a.length)) {
    const file = path.join(dir, 'AGENTS.md')
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    if (!text.trim()) continue
    const managed = extractManagedSection(text, 'SKS INIT-DEEP MANAGED SECTION')
    const userSummary = text.replace(/<!-- BEGIN [\s\S]*?<!-- END [^>]+-->/g, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4).join(' | ')
    const summary = [managed ? managed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4).join(' | ') : '', userSummary ? `user:${userSummary}` : ''].filter(Boolean).join(' || ')
    if (summary) {
      hints.push({
        path: path.relative(resolvedRoot, file),
        scope: path.relative(resolvedRoot, dir) || '.',
        summary
      })
    }
  }
  const unique = new Map<string, InitDeepMemoryHint>()
  for (const hint of hints) unique.set(`${hint.path}:${hint.scope}`, hint)
  return [...unique.values()].slice(0, 12)
}

async function scoreDirectories(root: string): Promise<DirectoryScore[]> {
  const counts = new Map<string, { file_count: number; langs: Set<string> }>()
  await walk(path.join(root, 'src'), root, counts)
  await walk(path.join(root, 'docs'), root, counts)
  const highRisk = [/src\/core\/zellij/, /src\/core\/loops/, /src\/core\/codex-app/, /src\/commands/]
  return [...counts.entries()].map(([dir, value]): DirectoryScore => {
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

function renderGeneratedAgents(rows: DirectoryScore[]): string {
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

function renderDirectoryAgentsBlock(row: DirectoryScore): string {
  return [
    `# SKS Init-Deep Local Guidance: ${row.dir}`,
    '',
    `- Files observed: ${row.file_count}`,
    `- Languages: ${row.languages.join(', ') || 'unknown'}`,
    `- Guidance: ${row.guidance}`,
    '- Preserve user-authored content outside this managed block.',
    '- Hydrate TriWiki/current source before risky edits in this directory.'
  ].join('\n')
}

function extractManagedSection(text: string, markerName: string): string {
  const begin = `<!-- BEGIN ${markerName} -->`
  const end = `<!-- END ${markerName} -->`
  const beginIdx = text.indexOf(begin)
  const endIdx = text.indexOf(end)
  if (beginIdx < 0 || endIdx < beginIdx) return ''
  return text.slice(beginIdx + begin.length, endIdx).trim()
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
