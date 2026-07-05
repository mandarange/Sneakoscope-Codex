#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { repairCodexImagegen } from '../core/doctor/imagegen-repair.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-imagegen-repair-'));
const stateFile = path.join(root, 'imagegen-enabled');
const reportPath = path.join(root, 'doctor-imagegen-repair.json');
const codexBin = path.join(root, 'codex');
await fs.writeFile(codexBin, `#!/usr/bin/env node
const fs = require('fs');
const stateFile = ${JSON.stringify(stateFile)};
const args = process.argv.slice(2).join(' ');
if (args === '--version') {
  console.log('codex-cli 99.0.0');
  process.exit(0);
}
if (args === 'features enable image_generation') {
  fs.writeFileSync(stateFile, '1');
  console.log('enabled image_generation');
  process.exit(0);
}
if (args === 'features list --json') {
  const enabled = fs.existsSync(stateFile);
  console.log(JSON.stringify({ features: { image_generation: enabled } }));
  process.exit(0);
}
if (args === 'features list') {
  const enabled = fs.existsSync(stateFile) ? 'true' : 'false';
  console.log('image_generation stable ' + enabled);
  process.exit(0);
}
console.error('unexpected fake codex args: ' + args);
process.exit(64);
`, { mode: 0o755 });

const report = await repairCodexImagegen({
  root,
  apply: true,
  codexBin,
  reportPath,
  timeoutMs: 1000
});
const reportFile = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const ok = report.schema === 'sks.doctor-imagegen-repair.v1'
  && report.attempted === true
  && report.recovered === true
  && report.after?.core_ready === true
  && report.steps?.some((step) => step.id === 'image_generation_feature_enable' && step.ok === true)
  && report.communication_test?.level === 'flag_level'
  && report.communication_test?.ok === true
  && report.communication_test?.real_generation_round_trip_performed === false
  && reportFile.recovered === true
  && reportFile.communication_test?.level === 'flag_level';

console.log(JSON.stringify({
  schema: 'sks.doctor-imagegen-repair-check.v1',
  ok,
  repair_schema: report.schema,
  attempted: report.attempted,
  recovered: report.recovered,
  after_core_ready: report.after?.core_ready === true,
  communication_test_level: report.communication_test?.level,
  report_path: reportPath
}, null, 2));
if (!ok) process.exitCode = 1;
