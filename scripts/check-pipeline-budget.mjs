#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const facade = path.join(root, 'src', 'core', 'pipeline.mjs');
const facadeLines = lineCount(facade);
if (facadeLines > 200) failures.push(`src/core/pipeline.mjs: line count ${facadeLines} > 200`);

const moduleDir = path.join(root, 'src', 'core', 'pipeline');
for (const file of fs.readdirSync(moduleDir).filter((name) => name.endsWith('.mjs'))) {
  const absolute = path.join(moduleDir, file);
  const lines = lineCount(absolute);
  if (lines > 1000) failures.push(`src/core/pipeline/${file}: line count ${lines} > 1000`);
}

const required = [
  'plan-schema.mjs',
  'stage-policy.mjs',
  'scout-stage-policy.mjs',
  'route-prep.mjs',
  'stop-gate.mjs',
  'active-context.mjs',
  'prompt-context.mjs',
  'pipeline-plan-writer.mjs',
  'validation.mjs'
];
for (const file of required) {
  if (!fs.existsSync(path.join(moduleDir, file))) failures.push(`src/core/pipeline/${file}: missing`);
}

if (failures.length) {
  console.error('Pipeline budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Pipeline budget check passed');

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
}
