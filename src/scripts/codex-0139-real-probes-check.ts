#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const args = process.argv.slice(2)
const requireReal = args.includes('--require-real')
const allowNetwork = args.includes('--allow-network')
const allowDesktop = args.includes('--allow-desktop')
const json = args.includes('--json')
const timeoutMs = Number(readArg('--timeout-ms') || process.env.SKS_CODEX_0139_REAL_PROBE_TIMEOUT_MS || 120000)
const missionId = readArg('--mission-id') || process.env.SKS_MISSION_ID || process.env.SNEAKOSCOPE_MISSION_ID || null
const probes = readRepeated('--probe')
const mod = await importDist('core/codex-control/codex-0139-probe-runner.js')
const writer = await importDist('core/codex-control/codex-0139-real-probes.js')
const result = await mod.runCodex0139RealProbes({ root, missionId, requireReal, allowNetwork, allowDesktop, timeoutMs, probes })
const artifacts = await writer.writeCodex0139RealProbeResult(root, result, { missionId, writeDist: true })
assertGate(result.overall_ok === true || !requireReal, requireReal ? 'codex:0139-real-probes:require-real failed' : 'codex:0139-real-probes optional probe runner failed', result)
emitGate(requireReal ? 'codex:0139-real-probes:require-real' : 'codex:0139-real-probes', {
  overall_ok: result.overall_ok,
  parsed_version: result.parsed_version,
  skipped: result.skipped,
  blockers: result.blockers,
  artifact: '.sneakoscope/codex-0139-real-probes.json',
  mission_artifact: artifacts.mission_artifact ? `.sneakoscope/missions/${missionId}/codex-0139-real-probes.json` : null,
  ...(json ? { result } : {})
})

function readArg(name) {
  const idx = args.indexOf(name)
  return idx >= 0 ? args[idx + 1] : null
}

function readRepeated(name) {
  const out = []
  for (let i = 0; i < args.length; i += 1) if (args[i] === name && args[i + 1]) out.push(args[i + 1])
  return out
}
