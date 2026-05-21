#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { detectImagegenCapability } from '../dist/core/imagegen/imagegen-capability.js';

const report = await detectImagegenCapability();
const out = path.join(process.cwd(), '.sneakoscope', 'reports', 'imagegen-capability-1.14.0.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
const ok = report.ok
  && report.model === 'gpt-image-2'
  && report.input_fidelity_must_be_omitted === true
  && report.gpt_image_2_input_fidelity_automatic === true;
console.log(JSON.stringify({ ...report, ok, path: out }, null, 2));
if (!ok) process.exitCode = 1;
