#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/scout-policy.js');
const local = mod.validateWorkerScoutEvidence(path.join(root, '.sneakoscope/missions/fixture/agents'), {
  agent_id: 'agent_1',
  artifact_path: 'sessions/agent_1/worker-scout/evidence.json'
});
const global = mod.validateWorkerScoutEvidence(path.join(root, '.sneakoscope/missions/fixture/agents'), {
  agent_id: 'agent_1',
  artifact_path: '../scout-ledger.json'
});
assertGate(local.ok === true && local.central_proof_ssot === false, 'worker Scout local evidence must be accepted only as local evidence', local);
assertGate(global.ok === false, 'worker Scout global artifact must be blocked', global);
emitGate('agent:worker-scout-limited', { local_ok: local.ok, global_ok: global.ok });
