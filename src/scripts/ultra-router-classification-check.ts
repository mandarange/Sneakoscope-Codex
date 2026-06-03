#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const classifier = await importDist('core/router/task-classifier.js');
const orchestrator = classifier.classifyCodexTask(baseTask({ prompt: 'strategy planning and final synthesis', route: '$Team' }));
const worker = classifier.classifyCodexTask(baseTask({ prompt: 'work item patch shard', route: '$Naruto', slotId: 'slot-001', workItemId: 'slice-1' }));
const imageWorker = classifier.classifyCodexTask(baseTask({ prompt: 'image QA shard', inputImages: ['screen.png'], slotId: 'slot-002', workItemId: 'slice-2' }));
assertGate(orchestrator.tier === 'orchestrator', 'main route must classify as orchestrator', orchestrator);
assertGate(worker.tier === 'worker', 'worker slot must classify as worker', worker);
assertGate(imageWorker.image_required === true, 'image task must carry image hard filter signal', imageWorker);
emitGate('ultra-router:classification', { orchestrator: orchestrator.tier, worker: worker.tier, image_required: imageWorker.image_required });

function baseTask(extra = {}) {
  return {
    route: '$Agent',
    missionId: 'M-ultra-router-classification',
    cwd: process.cwd(),
    prompt: 'fixture',
    inputFiles: [],
    inputImages: [],
    outputSchemaId: 'sks.agent-worker-result.v1',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true },
    mutationLedgerRoot: process.cwd(),
    ...extra
  };
}
