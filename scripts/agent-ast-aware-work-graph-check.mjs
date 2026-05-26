#!/usr/bin/env node
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const inventoryMod = await importDist('core/agents/work-partition/repo-inventory.js');
const depsMod = await importDist('core/agents/work-partition/dependency-graph.js');
const graphMod = await importDist('core/agents/intelligent-work-graph.js');
const inventory = await inventoryMod.collectRepoInventory(root, { maxFiles: 2000 });
const dependencyGraph = depsMod.buildDependencyGraph(inventory);
const graph = await graphMod.buildIntelligentWorkGraph({ root, inventory, dependencyGraph, route: '$Team', prompt: '1.18.5 AST-aware work graph release gate' });

assertGate(graph.schema === 'sks.intelligent-work-graph.v2', 'intelligent work graph schema must be v2', graph);
assertGate(graph.ast_coverage > 0, 'AST-aware work graph must record AST coverage', graph);
assertGate(Object.keys(graph.file_to_symbols).length > 0, 'AST-aware work graph must build file-to-symbol map', graph);
assertGate(Object.keys(graph.symbol_to_files).length > 0, 'AST-aware work graph must build symbol-to-file map', graph);
assertGate(Object.keys(graph.command_to_module_ownership).length > 0, 'AST-aware work graph must build command ownership map', graph);
assertGate(graph.test_ownership_confidence >= 0, 'AST-aware work graph must record test ownership confidence', graph);
assertGate(['proven', 'partial', 'blocked'].includes(graph.proof_level), 'AST-aware work graph must report an honest proof level', graph);
emitGate('agent:ast-aware-work-graph', { score: graph.work_graph_quality_score, ast_coverage: graph.ast_coverage, proof_level: graph.proof_level });
