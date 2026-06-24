import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('sks-triwiki-first-');
await writeText(path.join(tmp, 'package.json'), JSON.stringify({
  version: '4.0.2',
  scripts: {
    'triwiki:proof-card': 'node -e "process.exit(0)"',
    'release:version-truth': 'node -e "process.exit(0)"',
    'scheduler:resource-budget': 'node -e "process.exit(0)"'
  }
}, null, 2));
await writeText(path.join(tmp, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
await writeText(path.join(tmp, 'release-gates.v2.json'), JSON.stringify({
  schema: 'sks.release-gates.v2',
  gates: [
    gate('triwiki:proof-card', ['src/core/triwiki/**']),
    gate('release:version-truth', ['package.json']),
    gate('scheduler:resource-budget', ['src/core/release/**'])
  ]
}, null, 2));
await fs.mkdir(path.join(tmp, 'src/core/triwiki'), { recursive: true });
await writeText(path.join(tmp, 'src/core/triwiki/triwiki-proof-card.ts'), 'export const x = 1;\n');

const dag = await importDist('core/release/release-gate-dag.js');
const result = await dag.runReleaseGateDag({ root: tmp, preset: 'confidence', changedFiles: ['src/core/triwiki/triwiki-proof-card.ts'], noCache: true });
assertGate(result.triwiki_selection_used === true, 'TriWiki selection must be marked used', result);
assertGate(result.selected_gate_ids.includes('triwiki:proof-card'), 'TriWiki graph must select the TriWiki gate', result.selected_gate_ids);
assertGate(!result.selected_gate_ids.includes('scheduler:resource-budget'), 'unaffected scheduler gate must be skipped by TriWiki selection', result);
const rootSurfaceResult = await dag.runReleaseGateDag({ root: tmp, preset: 'affected', changedFiles: ['package.json'], noCache: true });
assertGate(rootSurfaceResult.triwiki_selection_used === false, 'root release surface changes should use focused affected selector instead of expensive TriWiki graph', rootSurfaceResult);
assertGate(rootSurfaceResult.selected_gate_ids.includes('release:version-truth'), 'root release surface should keep release safety gate', rootSurfaceResult.selected_gate_ids);
assertGate(!rootSurfaceResult.selected_gate_ids.includes('scheduler:resource-budget'), 'root release surface affected selector should not full-sweep unrelated scheduler gate', rootSurfaceResult.selected_gate_ids);
emitGate('release:triwiki-first-runner-blackbox', { selected: result.selected_gate_ids, skipped: result.triwiki_skipped_gates, root_surface_selected: rootSurfaceResult.selected_gate_ids });

function gate(id: string, inputs: string[]) {
  return {
    id,
    command: `npm run ${id} --silent`,
    deps: [],
    resource: ['cpu-light'],
    side_effect: 'hermetic',
    timeout_ms: 5000,
    cache: { enabled: false, inputs },
    isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
    preset: ['release']
  };
}
