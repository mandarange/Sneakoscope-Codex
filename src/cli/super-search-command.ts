import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runSuperSearch, type SuperSearchMode } from '../core/super-search/index.js'
import { buildSuperSearchDoctorReport, printSuperSearchDoctorReport } from '../core/super-search/doctor.js'
import { evaluateLocalGate } from '../core/commands/route-success-helpers.js'
import { evaluateRealEvidencePolicy } from '../core/verification/real-evidence-policy.js'

export async function superSearchCommand(sub: string = 'help', args: string[] = []) {
  const action = sub || 'help'
  if (action === 'run') return runCommand(args)
  if (action === 'x') return runCommand(['--mode', 'x_search', ...args])
  if (action === 'fetch') return runCommand(['--mode', 'url_acquisition', ...args])
  if (action === 'doctor') return doctorCommand(args)
  if (action === 'status' || action === 'inspect' || action === 'sources' || action === 'claims') return inspectCommand(action, args)
  if (action === 'cache') return cacheCommand(args)
  if (action === 'bench') return benchCommand(args)
  return helpCommand()
}

async function runCommand(args: string[]) {
  const json = args.includes('--json')
  const mode = readOption(args, '--mode') as SuperSearchMode | null
  const rawQuery = positional(args).join(' ').trim()
  const query = rawQuery || (mode === 'url_acquisition' ? 'fetch' : '')
  if (!query) throw new Error('Usage: sks super-search run "<query>" [--mode fast|balanced|deep|exhaustive] [--json]')
  if (mode && !['fast', 'balanced', 'deep', 'exhaustive', 'x_search', 'url_acquisition'].includes(mode)) {
    throw new Error('Unsupported Super-Search mode: ' + mode)
  }
  const missionDir = await mkMissionDir()
  const result = await runSuperSearch({
    missionDir,
    query,
    allowLocalFetch: args.includes('--allow-local'),
    ...(mode ? { mode } : {})
  })
  const gate = await evaluateSuperSearchGate(missionDir)
  const finalResult = {
    ...result,
    ok: result.ok === true && gate.ok === true,
    blockers: [...new Set([...(result.blockers || []), ...gate.blockers])],
    gate_evaluation: gate
  }
  if (json) console.log(JSON.stringify(finalResult, null, 2))
  else {
    console.log(`Super-Search ${finalResult.ok ? 'completed' : 'partial/blocked'}: ${result.mode}`)
    console.log(`Mission: ${missionDir}`)
    console.log(`Sources: ${result.sources.length}, verified: ${result.proof.verified_source_count}`)
    if (finalResult.blockers.length) console.log(`Blockers: ${finalResult.blockers.join(', ')}`)
  }
  if (!finalResult.ok) process.exitCode = 1
  return finalResult
}

async function doctorCommand(args: string[]) {
  const json = args.includes('--json')
  const report = await buildSuperSearchDoctorReport(args)
  printSuperSearchDoctorReport(report, json)
  return report
}

async function inspectCommand(action: string, args: string[]) {
  const json = args.includes('--json')
  const mission = positional(args)[0] || 'latest'
  const target = mission === 'latest' ? await latestMissionDir() : mission
  const file = path.join(target, 'super-search', action === 'sources' ? 'source-ledger.json' : action === 'claims' ? 'claim-ledger.json' : 'super-search-result.json')
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  const parsed = text ? JSON.parse(text) : {
    schema: 'sks.super-search-inspect-missing.v1',
    ok: false,
    mission: target,
    blockers: ['super_search_mission_artifact_missing:' + path.relative(process.cwd(), file)]
  }
  const gate = await evaluateSuperSearchGate(target)
  const evidence = await evaluateSuperSearchArtifacts(target)
  const parsedOk = parsed.ok === false ? false : true
  const result = {
    ...parsed,
    ok: parsedOk && gate.ok === true && evidence.ok === true,
    gate_evaluation: gate,
    real_evidence_policy: evidence,
    blockers: [...new Set([...(parsed.blockers || []), ...gate.blockers, ...evidence.blockers])]
  }
  if (!result.ok) process.exitCode = 1
  if (json) console.log(JSON.stringify(result, null, 2))
  else console.log(JSON.stringify(result, null, 2))
  return result
}

async function cacheCommand(args: string[]) {
  const sub = positional(args)[0] || 'status'
  const report = { schema: 'sks.super-search-cache.v1', ok: true, action: sub, local_only: true }
  console.log(JSON.stringify(report, null, 2))
  return report
}

async function benchCommand(args: string[]) {
  const report = {
    schema: 'sks.super-search-bench.v1',
    ok: false,
    suite: readOption(args, '--suite') || 'all',
    status: 'real_benchmark_not_run',
    blockers: ['real_web_or_x_parity_corpus_required']
  }
  console.log(JSON.stringify(report, null, 2))
  return report
}

function helpCommand() {
  console.log([
    'Usage:',
    '  sks super-search doctor [--json]',
    '  sks super-search run "<query>" [--mode fast|balanced|deep|exhaustive] [--json]',
    '  sks super-search x "<query>" [--json]',
    '  sks super-search fetch "<url>" [--json]',
    '  sks super-search status|inspect|sources|claims <mission|latest> [--json]',
    '  sks super-search cache status|prune|clear [--json]',
    '  sks super-search bench [--suite all|x|web|docs|blocked] [--json]'
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
      if (value !== '--json' && value !== '--allow-local') i++
      continue
    }
    out.push(value)
  }
  return out
}

async function mkMissionDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.sneakoscope', 'missions', `super-search-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function latestMissionDir(): Promise<string> {
  const root = path.join(process.cwd(), '.sneakoscope', 'missions')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort()
  let latest: string | null = null
  for (const dir of dirs.reverse()) {
    if (await hasSuperSearchArtifactDir(dir)) {
      latest = dir
      break
    }
  }
  if (!latest) return path.join(os.tmpdir(), 'sks-super-search-missing')
  return latest
}

async function hasSuperSearchArtifactDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dir, 'super-search'))
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function evaluateSuperSearchGate(missionDir: string) {
  return evaluateLocalGate({
    root: process.cwd(),
    dir: missionDir,
    gateFile: path.join('super-search', 'super-search-gate.json'),
    requiredArtifacts: [
      path.join('super-search', 'source-ledger.json'),
      path.join('super-search', 'claim-ledger.json'),
      path.join('super-search', 'super-search-proof.json'),
      path.join('super-search', 'super-search-result.json')
    ]
  })
}

async function evaluateSuperSearchArtifacts(missionDir: string) {
  const artifactDir = path.join(missionDir, 'super-search')
  const [result, sourceLedger, claimLedger, proof] = await Promise.all([
    readJsonFile(path.join(artifactDir, 'super-search-result.json')),
    readJsonFile(path.join(artifactDir, 'source-ledger.json')),
    readJsonFile(path.join(artifactDir, 'claim-ledger.json')),
    readJsonFile(path.join(artifactDir, 'super-search-proof.json'))
  ])
  const sources = Array.isArray(result?.sources) ? result.sources : Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []
  const claims = Array.isArray(result?.claims) ? result.claims : Array.isArray(claimLedger?.claims) ? claimLedger.claims : []
  const proofData = result?.proof || proof || {}
  return evaluateRealEvidencePolicy({
    productionMode: true,
    mode: result?.mode || proofData?.mode,
    sources,
    claims,
    proof: proofData
  })
}

async function readJsonFile(file: string): Promise<any | null> {
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
