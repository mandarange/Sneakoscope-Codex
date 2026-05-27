#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { detectImagegenCapability } from '../dist/core/imagegen/imagegen-capability.js';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const report = await detectImagegenCapability();
const out = path.join(process.cwd(), '.sneakoscope', 'reports', `imagegen-capability-${pkg.version}.json`);
const stableOut = path.join(process.cwd(), '.sneakoscope', 'reports', 'imagegen-capability.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(stableOut, `${JSON.stringify(report, null, 2)}\n`);
const ok = report.ok
  && report.core_feature === true
  && report.core_ready === true
  && report.codex_app?.available === true
  && report.codex_app_builtin_output_required === true
  && report.capability_detection_is_not_output_proof === true
  && report.real_generation_available === true
  && report.model === 'gpt-image-2'
  && report.openai_images_api?.official_codex_app_substitute === false
  && report.api_fallback_satisfies_codex_app_evidence === false
  && report.input_fidelity_must_be_omitted === true
  && report.gpt_image_2_input_fidelity_automatic === true
  && Array.isArray(report.core_blockers)
  && report.core_blockers.length === 0;
console.log(JSON.stringify({ ...report, ok, path: out, stable_path: stableOut }, null, 2));
if (!ok) process.exitCode = 1;
