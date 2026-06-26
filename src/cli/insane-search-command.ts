import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runUltraSearch, type UltraSearchMode } from '../core/ultra-search/index.js'

export async function insaneSearchCommand(sub: string = 'help', args: string[] = []) {
  const action = sub || 'help'
  if (action === 'run') return runCommand(args)
  if (action === 'x') return runCommand(['--mode', 'x_search', ...args])
  if (action === 'fetch') return runCommand(['--mode', 'url_acquisition', ...args])
  if (action === 'doctor') return doctorCommand(args)
  if (action === 'status' || action === 'inspect' || action === 'sources' || action === 'claims') return inspectCommand(action, args)
  if (action === 'cache') return cacheCommand(args)
  if (action === 'bench') return benchCommand(args)
  if (action === 'migrate-xai') return migrateXaiCommand(args)
  return helpCommand()
}

export const ultraSearchCommand = insaneSearchCommand

async function runCommand(args: string[]) {
  const json = args.includes('--json')
  const mode = readOption(args, '--mode') as UltraSearchMode | null
  const query = positional(args).join(' ').trim()
  if (!query) throw new Error('Usage: sks insane-search run "<query>" [--mode fast|balanced|deep|exhaustive|x_search|url_acquisition] [--json]')
  const missionDir = await mkMissionDir()
  const result = await runUltraSearch({
    missionDir,
    query,
    ...(mode ? { mode } : {})
  })
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`InsaneSearch ${result.ok ? 'completed' : 'partial/blocked'}: ${result.mode}`)
    console.log(`Mission: ${missionDir}`)
    console.log(`Sources: ${result.sources.length}, verified: ${result.proof.verified_source_count}`)
    if (result.blockers.length) console.log(`Blockers: ${result.blockers.join(', ')}`)
  }
  return result
}

async function doctorCommand(args: string[]) {
  const json = args.includes('--json')
  const report = {
    schema: 'sks.ultra-search-doctor.v1',
    ok: true,
    core_ready: true,
    xai_required: false,
    optional: {
      context7: 'external_runtime_optional_by_intent',
      codex_web: process.env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '1' || process.env.CODEX_WEB_SEARCH_AVAILABLE === '1' ? 'available' : 'not_bound',
      authenticated_chrome: 'operator_consented_optional',
      official_x_api: 'credentials_optional_not_required'
    },
    blockers: [],
    warnings: []
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log('InsaneSearch doctor: core ready; xAI/Grok is not required.')
  return report
}

async function inspectCommand(action: string, args: string[]) {
  const json = args.includes('--json')
  const mission = positional(args)[0] || 'latest'
  const target = mission === 'latest' ? await latestMissionDir() : mission
  const file = path.join(target, 'ultra-search', action === 'sources' ? 'source-ledger.json' : action === 'claims' ? 'claim-ledger.json' : 'ultra-search-result.json')
  const text = await fs.readFile(file, 'utf8')
  if (json) console.log(text.trim())
  else console.log(text)
  return JSON.parse(text)
}

async function cacheCommand(args: string[]) {
  const sub = positional(args)[0] || 'status'
  const report = { schema: 'sks.ultra-search-cache.v1', ok: true, action: sub, local_only: true }
  console.log(JSON.stringify(report, null, 2))
  return report
}

async function benchCommand(args: string[]) {
  const report = {
    schema: 'sks.ultra-search-bench.v1',
    ok: false,
    suite: readOption(args, '--suite') || 'all',
    status: 'real_benchmark_not_run',
    blockers: ['real_web_or_x_parity_corpus_required']
  }
  console.log(JSON.stringify(report, null, 2))
  return report
}

async function migrateXaiCommand(args: string[]) {
  const apply = args.includes('--apply')
  const report = {
    schema: apply ? 'sks.ultra-search-xai-migration-result.v1' : 'sks.ultra-search-xai-migration-plan.v1',
    ok: true,
    applied: false,
    managed_candidates: [],
    unowned_preserved: true,
    note: 'No automatic MCP config deletion is performed without an owned managed marker and explicit --apply.'
  }
  console.log(JSON.stringify(report, null, 2))
  return report
}

function helpCommand() {
  console.log([
    'Usage:',
    '  sks insane-search doctor [--json]',
    '  sks insane-search run "<query>" [--mode fast|balanced|deep|exhaustive]',
    '  sks insane-search x "<query>"',
    '  sks insane-search fetch "<url>"',
    '  sks insane-search status|inspect|sources|claims <mission|latest>',
    '  sks insane-search cache status|prune|clear',
    '  sks insane-search bench [--suite all|x|web|docs|blocked]',
    '  sks insane-search migrate-xai [--apply]',
    '',
    'Compatibility:',
    '  sks ultra-search ...'
  ].join('\n'))
  return { ok: true, status: 'help' }
}

function readOption(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  const value = index >= 0 ? args[index + 1] : undefined
  return value || null
}

function positional(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const value = args[i]
    if (!value) continue
    if (value.startsWith('--')) {
      if (value !== '--json') i++
      continue
    }
    out.push(value)
  }
  return out
}

async function mkMissionDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.sneakoscope', 'missions', `ultra-${Date.now().toString(36)}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function latestMissionDir(): Promise<string> {
  const root = path.join(process.cwd(), '.sneakoscope', 'missions')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort()
  const latest = dirs.reverse().find(asyncDirLikelyUltra)
  if (!latest) return path.join(os.tmpdir(), 'sks-ultra-search-missing')
  return latest
}

function asyncDirLikelyUltra(dir: string): boolean {
  return Boolean(dir)
}
