#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const inventoryMod = await importDist('core/agents/work-partition/repo-inventory.js');
const depsMod = await importDist('core/agents/work-partition/dependency-graph.js');
const graphMod = await importDist('core/agents/intelligent-work-graph.js');
const inventory = await inventoryMod.collectRepoInventory(root, { maxFiles: 2000 });
const dependencyGraph = depsMod.buildDependencyGraph(inventory);
const graph = await graphMod.buildIntelligentWorkGraph({ root, inventory, dependencyGraph, route: '$Team', prompt: '1.18.6 intelligent work graph release gate' });
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-work-graph-'));
await graphMod.writeIntelligentWorkGraphArtifacts(out, graph);
assertGate(graph.schema === 'sks.intelligent-work-graph.v2', 'intelligent work graph schema mismatch', graph);
assertGate(graph.source_inventory_count > 0, 'source inventory must be populated', graph);
assertGate(graph.test_inventory_count > 0, 'test inventory must be populated', graph);
assertGate(graph.critical_path.length > 0, 'critical path must be computed', graph.critical_path);
assertGate(graph.parallelizable_groups.length > 0, 'parallelizable groups must be computed', graph);
assertGate(graph.work_graph_quality_score >= 0.55, 'work graph quality score too low for release gate', graph);
for (const file of ['agent-intelligent-work-graph.json', 'agent-test-ownership-map.json', 'agent-critical-path.json', 'agent-integration-bottlenecks.json']) {
  await fs.access(path.join(out, file));
}
emitGate('agent:intelligent-work-graph', { score: graph.work_graph_quality_score, critical_path_length: graph.critical_path.length });
