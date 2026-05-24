#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const facade = path.join(root, 'src', 'core', 'pipeline.mjs');
const facadeLines = lineCount(facade);
if (facadeLines > 200) failures.push(`src/core/pipeline.mjs: line count ${facadeLines} > 200`);

const runtimeFacade = path.join(root, 'src', 'core', 'pipeline-runtime.mjs');
if (fs.existsSync(runtimeFacade)) {
  const runtimeLines = lineCount(runtimeFacade);
  if (runtimeLines > 300) failures.push(`src/core/pipeline-runtime.mjs: line count ${runtimeLines} > 300`);
  const text = fs.readFileSync(runtimeFacade, 'utf8');
  if (/from ['"].*\\b(team|qa|research|ppt|image-ux-review|db|gx)\\b/i.test(text)) {
    failures.push('src/core/pipeline-runtime.mjs: compatibility facade imports route implementation modules directly');
  }
}

const moduleDir = path.join(root, 'src', 'core', 'pipeline');
for (const file of fs.readdirSync(moduleDir).filter((name) => name.endsWith('.mjs'))) {
  const absolute = path.join(moduleDir, file);
  const lines = lineCount(absolute);
  if (lines > 1000) failures.push(`src/core/pipeline/${file}: line count ${lines} > 1000`);
  const imports = fs.readFileSync(absolute, 'utf8').match(/\\bfrom\\s+['"][^'"]+['"]/g) || [];
  if (imports.length > 35) failures.push(`src/core/pipeline/${file}: import count ${imports.length} > 35`);
}

const required = [
  'plan-schema.mjs',
  'stage-policy.mjs',
  'agent-stage-policy.mjs',
  'route-prep.mjs',
  'route-prep-team.mjs',
  'route-prep-research.mjs',
  'route-prep-qa.mjs',
  'route-prep-ppt.mjs',
  'route-prep-image-ux.mjs',
  'route-prep-db.mjs',
  'route-prep-gx.mjs',
  'stop-gate.mjs',
  'stop-gate-context7.mjs',
  'stop-gate-subagents.mjs',
  'stop-gate-proof.mjs',
  'active-context.mjs',
  'prompt-context.mjs',
  'prompt-context-dfix.mjs',
  'prompt-context-answer.mjs',
  'prompt-context-computer-use.mjs',
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
