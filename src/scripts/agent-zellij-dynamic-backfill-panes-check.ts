#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const proof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'agent-slot-pane-binding-proof.js')).href);
const targetActiveSlots = 4;
const workItems = 10;
const records = Array.from({ length: workItems }, (_, index) => {
  const slotIndex = (index % targetActiveSlots) + 1;
  const generationIndex = Math.floor(index / targetActiveSlots) + 1;
  const slotId = `slot-${String(slotIndex).padStart(3, '0')}`;
  return {
    slot_id: slotId,
    generation_index: generationIndex,
    pane_name: `${slotId}/gen-${generationIndex}`,
    active_at_once: targetActiveSlots
  };
});
const report = proof.evaluateWorkerPaneBackfillProof(records, targetActiveSlots, workItems);
const bad = proof.evaluateWorkerPaneBackfillProof(records.slice(0, 5), targetActiveSlots, workItems);
const ok = report.ok
  && report.generation_record_count >= 10
  && report.distinct_pane_count >= 10
  && bad.ok === false
  && bad.blockers.includes('dynamic_backfill_generation_records_missing');
emit({ schema: 'sks.agent-zellij-dynamic-backfill-panes-check.v1', ok, report, bad, blockers: ok ? [] : ['agent_zellij_dynamic_backfill_panes_check_failed'] });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-zellij-dynamic-backfill-panes-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
