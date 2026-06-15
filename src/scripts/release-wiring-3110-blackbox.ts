#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, readText, root } from './sks-1-18-gate-lib.js';
import { REQUIRED_3110_RELEASE_IDS, buildReleaseGateScriptParityReport } from './release-gate-script-parity-check.js';
import { writeJsonAtomic } from '../core/fsx.js';

const required = REQUIRED_3110_RELEASE_IDS;
const parity = buildReleaseGateScriptParityReport();
const dag = readText('src/scripts/release-dag-full-coverage-check.ts');
const missingDag = required.filter((id) => !dag.includes(`'${id}'`));

const report = {
  schema: 'sks.release-wiring-3110-blackbox.v1',
  ok: parity.ok && missingDag.length === 0,
  required_count: required.length,
  missing_scripts: parity.missing_scripts,
  missing_gates: parity.missing_gates,
  missing_release_preset: parity.missing_release_preset,
  missing_required_ids: missingDag,
  wrong_commands: parity.wrong_commands,
  missing_sources: parity.missing_source_targets,
  missing_dist_targets: parity.missing_dist_targets,
  generated_at: new Date().toISOString()
};
const out = path.join(root, '.sneakoscope', 'reports', 'release-wiring-3110-blackbox.json');
await writeJsonAtomic(out, report);

assertGate(report.ok, '3.1.10 release wiring blackbox failed', report);
emitGate('release:wiring-3110-blackbox', { required_count: required.length });
