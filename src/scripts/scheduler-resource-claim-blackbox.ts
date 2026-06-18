import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('sks-scheduler-claim-');
await writeText(path.join(tmp, 'package.json'), JSON.stringify({ version: '4.0.2', scripts: { 'secret:one': 'node -e "setTimeout(()=>process.exit(0),20)"', 'zellij:one': 'node -e "setTimeout(()=>process.exit(0),20)"' } }, null, 2));
await writeText(path.join(tmp, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
await writeText(path.join(tmp, 'release-gates.v2.json'), JSON.stringify({ schema: 'sks.release-gates.v2', gates: [gate('secret:one', ['secret-sensitive']), gate('zellij:one', ['zellij-real'])] }, null, 2));
const scheduler = await importDist('core/release/extreme-parallel-scheduler.js');
const report = await scheduler.executeExtremeSchedule({
  root: tmp,
  graph: { schema: 'sks.triwiki-affected-graph.v1', root: tmp, tier: 'confidence', changed_files: [], affected_modules: [], gate_packs: ['secret', 'zellij'], gates: ['secret:one', 'zellij:one'], release_equivalent_within_scope: true, confidence: 'affected-release-equivalent', conservative_reason: null, reused_proofs: [], invalidated_proofs: [], required_new_proofs: [] },
  slaMs: 30_000,
  budget: { schema: 'sks.resource-class-budget.v1', cpu_light: 4, cpu_heavy: 1, io_light: 4, io_heavy: 1, fs_read: 4, network: 1, remote_model_real: 1, zellij_real: 1, browser_real: 1, secret_sensitive: 1 },
  useProofBank: false
});
const timeline = JSON.parse(await fs.readFile(report.resource_claim_timeline, 'utf8')) as { events: Array<{ event: string }> };
assertGate(report.ok === true && report.executed_packs.length === 2, 'scheduler must execute selected packs', report);
assertGate(timeline.events.some((event) => event.event === 'claim') && timeline.events.some((event) => event.event === 'release'), 'scheduler must write claim/release timeline', timeline);
emitGate('scheduler:resource-claim-blackbox', { packs: report.executed_packs.length, timeline: timeline.events.length });

function gate(id: string, resource: string[]) {
  return { id, command: `npm run ${id} --silent`, deps: [], resource, side_effect: 'hermetic', timeout_ms: 5000, cache: { enabled: false, inputs: ['package.json'] }, isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' }, preset: ['release'] };
}
