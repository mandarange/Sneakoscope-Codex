#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/naruto/naruto-work-graph.js')
const roles = await importDist('core/naruto/naruto-role-policy.js')
const packMod = await importDist('core/naruto/naruto-gpt-final-pack.js')

const graph = workGraph.buildNarutoWorkGraph({ requestedClones: 100, totalWorkItems: 120, writeCapable: true })
const roleDistribution = roles.buildNarutoRoleDistribution(graph.work_items)
const patchEnvelopes = Array.from({ length: 120 }, (_, index) => ({ id: index, token: 'sk-testsecret1234567890', file: `f-${index}.ts` }))
const logs = Array.from({ length: 40 }, (_, index) => `log ${index} api_key=secret-${index}`)
const pack = packMod.buildNarutoGptFinalPack({
  missionId: 'M-naruto-pack',
  graph,
  roleDistribution,
  changedFiles: ['src/a.ts', 'src/a.ts', 'src/b.ts'],
  patchEnvelopes,
  verificationResults: [{ ok: true }],
  failedShards: [{ id: 'failed-1' }],
  conflictMap: [{ path: 'src/a.ts' }],
  rollbackPlan: { token: 'sk-abc12345678901234567' },
  logs
})
const serialized = JSON.stringify(pack)

assertGate(pack.bounded === true && pack.secrets_redacted === true, 'GPT final pack must be bounded and redacted', pack)
assertGate(pack.patch_envelopes.length === 100, '100 worker results must compress to bounded patch envelope count', { count: pack.patch_envelopes.length })
assertGate(pack.representative_logs.length === 12, 'representative logs must be bounded', { count: pack.representative_logs.length })
assertGate(!serialized.includes('secret-') && !serialized.includes('sk-testsecret'), 'secrets must be redacted from final pack', pack)
assertGate(pack.role_distribution.ok === true && pack.work_graph_summary.write_allowed_count > 0, 'final pack must include role distribution and write work summary', pack)

emitGate('naruto:gpt-final-pack', {
  patch_envelopes: pack.patch_envelopes.length,
  representative_logs: pack.representative_logs.length,
  changed_files: pack.changed_files
})

