import fsp from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export interface FsxHotpathViolation {
  hotpath: string
  file: string
  rule: string
  matched: string
}

export interface FsxHotpathReport {
  schema: 'sks.fsx-hotpath.v1'
  ok: boolean
  generated_at: string
  checked_files: string[]
  violations: FsxHotpathViolation[]
}

interface HotpathRuleSet {
  hotpath: string
  files: string[]
  rules: Array<{ id: string; pattern: RegExp }>
}

const HOTPATH_RULES: HotpathRuleSet[] = [
  {
    hotpath: 'hook user-prompt-submit',
    files: ['src/core/hooks-runtime.ts', 'src/core/hooks-runtime/code-pack-freshness-preflight.ts'],
    rules: [
      rule('no_recursive_fs', /readdir\([^)]*recursive\s*:\s*true|recursive\s*:\s*true/)
    ]
  },
  {
    hotpath: 'version/root/commands',
    files: ['src/bin/sks.ts', 'src/cli/commands-fast.ts', 'src/cli/help-fast.ts'],
    rules: [
      rule('no_writes', /write(?:Json|Text|File|Sync|Binary)|appendFile|appendJsonl|fs\.write|fsp\.write/)
    ]
  },
  {
    hotpath: 'commands --json',
    files: ['src/cli/commands-fast.ts'],
    rules: [
      rule('no_mission_scan', /\.sneakoscope[/\\]missions|missionsDir|readdir\([^)]*missions/)
    ]
  }
]

export async function checkFsxHotpaths(root: string): Promise<FsxHotpathReport> {
  const checked = new Set<string>()
  const violations: FsxHotpathViolation[] = []
  for (const group of HOTPATH_RULES) {
    for (const file of group.files) {
      checked.add(file)
      const text = await fsp.readFile(path.join(root, file), 'utf8').catch(() => '')
      for (const item of group.rules) {
        const match = text.match(item.pattern)
        if (!match) continue
        violations.push({
          hotpath: group.hotpath,
          file,
          rule: item.id,
          matched: match[0].slice(0, 160)
        })
      }
    }
  }
  return {
    schema: 'sks.fsx-hotpath.v1',
    ok: violations.length === 0,
    generated_at: new Date().toISOString(),
    checked_files: [...checked].sort(),
    violations
  }
}

export async function writeFsxHotpathReport(root: string): Promise<FsxHotpathReport> {
  const report = await checkFsxHotpaths(root)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'fsx-hotpath.json'), report)
  return report
}

function rule(id: string, pattern: RegExp): { id: string; pattern: RegExp } {
  return { id, pattern }
}
