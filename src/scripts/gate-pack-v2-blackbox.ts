import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('sks-gate-pack-v2-');
await writeText(path.join(tmp, 'package.json'), JSON.stringify({ version: '4.0.2', scripts: { 'triwiki:proof-card': 'node -e "if(!process.env.SKS_GATE_PACK_ARTIFACT) process.exit(2)"' } }, null, 2));
await writeText(path.join(tmp, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
await writeText(path.join(tmp, 'release-gates.v2.json'), JSON.stringify({ schema: 'sks.release-gates.v2', gates: [gate('triwiki:proof-card')] }, null, 2));
await fs.mkdir(path.join(tmp, 'src/core/triwiki'), { recursive: true });

const runner = await importDist('core/release/gate-pack-runner.js');
const report = await runner.executeGatePack({ root: tmp, packId: 'triwiki', mode: 'execute' });
assertGate(report.ok === true && report.executed === 1, 'gate pack v2 must execute through async runner', report);
assertGate(report.proof_paths.length >= 2, 'gate pack v2 must write gate and pack proofs', report);
emitGate('gate-pack:v2-blackbox', { executed: report.executed, proofs: report.proof_paths.length });

function gate(id: string) {
  return { id, command: `npm run ${id} --silent`, deps: [], resource: ['cpu-light'], side_effect: 'hermetic', timeout_ms: 5000, cache: { enabled: false, inputs: ['package.json'] }, isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' }, preset: ['release'] };
}
