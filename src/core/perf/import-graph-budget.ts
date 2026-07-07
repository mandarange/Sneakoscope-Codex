import fsp from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export interface ImportBudgetViolation {
  fast_path: string
  file: string
  forbidden: string
  matched: string
}

export interface ImportGraphBudgetReport {
  schema: 'sks.import-graph-budget.v1'
  ok: boolean
  generated_at: string
  checked_files: string[]
  violations: ImportBudgetViolation[]
}

interface FastPathBudget {
  fastPath: string
  files: string[]
  forbidden: Array<{ id: string; pattern: RegExp }>
  sourceSlice?: (file: string, text: string) => string
}

const IMPORT_BUDGETS: FastPathBudget[] = [
  {
    fastPath: '--version',
    files: ['src/bin/sks.ts'],
    sourceSlice: entrypointBranch("--version'"),
    forbidden: [
      forbidden('routes', /from ['"].*core\/routes|import\(['"].*core\/routes/),
      forbidden('command-registry', /from ['"].*command-registry|import\(['"].*command-registry/),
      forbidden('doctor', /from ['"].*doctor|import\(['"].*doctor/),
      forbidden('super-search', /from ['"].*super-search|import\(['"].*super-search/),
      forbidden('recursive-fs-scan', /readdir\([^)]*recursive\s*:\s*true|recursive\s*:\s*true/)
    ]
  },
  {
    fastPath: 'commands --json',
    files: ['src/bin/sks.ts', 'src/cli/commands-fast.ts'],
    sourceSlice: (file, text) => file === 'src/bin/sks.ts' ? entrypointBranch("commands'")(file, text) : text,
    forbidden: [
      forbidden('doctor-repair-modules', /doctor-(?:fix|startup|context7|supabase)|doctor\/repair|doctor-repair/),
      forbidden('naruto-runtime', /core\/naruto|naruto-runtime|native-cli-worker/),
      forbidden('super-search-runtime', /super-search\/runtime|runSuperSearch/),
      forbidden('release-runtime', /release-(?:gate|check|registry|metadata)|commands\/release/)
    ]
  },
  {
    fastPath: 'root --json',
    files: ['src/bin/sks.ts'],
    sourceSlice: entrypointBranch("root'"),
    forbidden: [
      forbidden('route-table', /core\/routes|COMMAND_CATALOG|DOLLAR_COMMANDS|ROUTES/),
      forbidden('feature-registry', /feature-registry/),
      forbidden('network-provider-probes', /fetch\(|provider.*probe|registry\.npmjs/)
    ]
  },
  {
    fastPath: 'super-search doctor --json',
    files: ['src/bin/sks.ts', 'src/core/super-search/doctor.ts'],
    sourceSlice: (file, text) => file === 'src/bin/sks.ts' ? entrypointBranch("super-search'")(file, text) : text,
    forbidden: [
      forbidden('runSuperSearch', /runSuperSearch/),
      forbidden('url-fetch-execution', /fetch\(/),
      forbidden('cache-scan', /readdir\([^)]*cache|recursive\s*:\s*true/)
    ]
  },
  {
    fastPath: 'hook user-prompt-submit',
    files: ['src/core/hooks-runtime.ts', 'src/core/hooks-runtime/code-pack-freshness-preflight.ts'],
    forbidden: [
      forbidden('release-scripts', /release-(?:gate|check|registry|metadata|version)|scripts\/release/),
      forbidden('super-search-runtime', /super-search\/runtime|runSuperSearch/),
      forbidden('npm-registry', /registry\.npmjs|npm view|npm info/),
      forbidden('recursive-scan', /readdir\([^)]*recursive\s*:\s*true|recursive\s*:\s*true/),
      forbidden('build-check-scripts', /build:clean|tsc -p|dist\/scripts\/.*check/)
    ]
  }
]

export async function checkImportGraphBudget(root: string): Promise<ImportGraphBudgetReport> {
  const checked = new Set<string>()
  const violations: ImportBudgetViolation[] = []
  for (const budget of IMPORT_BUDGETS) {
    for (const file of budget.files) {
      checked.add(file)
      const text = await fsp.readFile(path.join(root, file), 'utf8').catch(() => '')
      const checkText = budget.sourceSlice ? budget.sourceSlice(file, text) : text
      for (const rule of budget.forbidden) {
        const match = checkText.match(rule.pattern)
        if (!match) continue
        violations.push({
          fast_path: budget.fastPath,
          file,
          forbidden: rule.id,
          matched: match[0].slice(0, 160)
        })
      }
    }
  }
  return {
    schema: 'sks.import-graph-budget.v1',
    ok: violations.length === 0,
    generated_at: new Date().toISOString(),
    checked_files: [...checked].sort(),
    violations
  }
}

export async function writeImportGraphBudgetReport(root: string): Promise<ImportGraphBudgetReport> {
  const report = await checkImportGraphBudget(root)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'import-graph-budget.json'), report)
  return report
}

function forbidden(id: string, pattern: RegExp): { id: string; pattern: RegExp } {
  return { id, pattern }
}

function entrypointBranch(anchor: string): (file: string, text: string) => string {
  return (_file: string, text: string): string => {
    const index = text.indexOf(anchor)
    if (index < 0) return text
    const start = text.lastIndexOf('} else if', index)
    const branchStart = start >= 0 ? start : text.lastIndexOf('if', index)
    const nextElse = text.indexOf('} else if', index + anchor.length)
    const nextFinalElse = text.indexOf('} else {', index + anchor.length)
    const candidates = [nextElse, nextFinalElse].filter((value) => value >= 0)
    const branchEnd = candidates.length ? Math.min(...candidates) : text.length
    return text.slice(Math.max(0, branchStart), branchEnd)
  }
}
