#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/naruto/naruto-work-graph.js')
const graph = workGraph.buildNarutoWorkGraph({
  requestedClones: 24,
  totalWorkItems: 30,
  writeCapable: true,
  targetPaths: Array.from({ length: 30 }, (_, index) => `src/fixture-${index}.ts`),
  maxActiveWorkers: 8
})
const validation = workGraph.validateNarutoWorkGraph(graph)

assertGate(graph.ok === true && validation.ok === true, 'Naruto work graph must validate', { graph_blockers: graph.blockers, validation })
assertGate(graph.total_work_items >= graph.requested_clones * 2, 'write-capable work graph must create at least 2x requested clone count', { total: graph.total_work_items, requested: graph.requested_clones })
assertGate(graph.mixed_work_kinds.length > 4, 'work graph must contain mixed work kinds, not only verification', { kinds: graph.mixed_work_kinds })
assertGate(graph.write_allowed_count > 0, 'write-capable Naruto graph must include write_allowed work items', { write_allowed_count: graph.write_allowed_count })
assertGate(graph.active_waves.every((wave) => wave.conflict_count === 0), 'active waves must not overlap write leases', { waves: graph.active_waves })

emitGate('naruto:work-graph', {
  total_work_items: graph.total_work_items,
  mixed_work_kinds: graph.mixed_work_kinds,
  write_allowed_count: graph.write_allowed_count,
  wave_count: graph.active_waves.length
})
