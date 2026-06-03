#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';
import { writeReport } from './agent-patch-swarm-gate-lib.js';

const strategy = await importDist('core/strategy/strategy-compiler.js');
const compiled = strategy.compileStrategy({ prompt: '`file-1.txt` `file-2.txt`', route: '$Agent', agentCount: 2 });
const verificationNodes = compiled.verification_rollback_dag.nodes.filter((node) => node.kind === 'verification');
const report = { schema: 'sks.agent-patch-verification-dag-check.v1', ok: verificationNodes.length > 0, dag: compiled.verification_rollback_dag, verificationNodes };
writeReport('agent-patch-verification-dag', report);
assertGate(compiled.verification_rollback_dag.schema === 'sks.verification-rollback-dag.v1', 'verification rollback DAG schema must exist', report);
assertGate(verificationNodes.length > 0, 'verification DAG must include verification nodes', report);
assertGate(verificationNodes.every((node) => node.proof_artifact), 'verification DAG nodes must carry proof artifacts', report);
emitGate('agent:patch-verification-dag', { verification_nodes: verificationNodes.length });
