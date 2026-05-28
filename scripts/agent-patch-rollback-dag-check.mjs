#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';
import { writeReport } from './agent-patch-swarm-gate-lib.mjs';

const strategy = await importDist('core/strategy/strategy-compiler.js');
const compiled = strategy.compileStrategy({ prompt: '`file-1.txt` `file-2.txt`', route: '$Agent', agentCount: 2 });
const rollbackNodes = compiled.verification_rollback_dag.nodes.filter((node) => node.kind === 'rollback');
const report = { schema: 'sks.agent-patch-rollback-dag-check.v1', ok: compiled.verification_rollback_dag.rollback_ready, dag: compiled.verification_rollback_dag, rollbackNodes };
writeReport('agent-patch-rollback-dag', report);
assertGate(compiled.verification_rollback_dag.rollback_ready === true, 'rollback DAG must be ready', report);
assertGate(rollbackNodes.length > 0, 'rollback DAG must include rollback nodes', report);
assertGate(rollbackNodes.every((node) => node.proof_artifact), 'rollback DAG nodes must carry proof artifacts', report);
emitGate('agent:patch-rollback-dag', { rollback_nodes: rollbackNodes.length });
