#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/naruto/naruto-work-graph.js')
const roles = await importDist('core/naruto/naruto-role-policy.js')
const roster = await importDist('core/agents/agent-roster.js')

const graph = workGraph.buildNarutoWorkGraph({ requestedClones: 30, totalWorkItems: 30, writeCapable: true })
const distribution = roles.buildNarutoRoleDistribution(graph.work_items)
const cloneRoster = roster.buildNarutoCloneRoster({ clones: 30, prompt: 'implement, modify, test, verify, document, and resolve conflicts' })
const writeCapableRoster = cloneRoster.roster.filter((row) => row.write_allowed === true)

assertGate(distribution.ok === true, 'write-capable Naruto role distribution must pass', distribution)
assertGate(distribution.verifier_only === false, 'default Naruto must not be verifier-only', distribution)
assertGate(distribution.implementation_like_ratio >= 0.4, 'default Naruto must keep at least 40% implementation/modification/test roles', distribution)
assertGate(writeCapableRoster.length >= Math.floor(cloneRoster.roster.length * 0.4), 'Naruto roster must include write-capable clone roles by default', { writeCapableRoster: writeCapableRoster.length, total: cloneRoster.roster.length })

const readonlyGraph = workGraph.buildNarutoWorkGraph({ requestedClones: 8, readonly: true, writeCapable: false })
const readonlyDistribution = roles.buildNarutoRoleDistribution(readonlyGraph.work_items, { readonly: true })
assertGate(readonlyDistribution.ok === true, 'readonly Naruto route may use read-only verifier/research roles', readonlyDistribution)

emitGate('naruto:role-distribution', {
  implementation_like_ratio: distribution.implementation_like_ratio,
  entries: distribution.entries,
  write_capable_roster_count: writeCapableRoster.length
})

