#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'core', 'pipeline-runtime.mjs');
const failures = [];

if (fs.existsSync(file)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).length;
  if (lines > 300) failures.push(`src/core/pipeline-runtime.mjs: line count ${lines} > 300`);
  if (!/pipeline-internals\/runtime-core\.mjs/.test(text)) failures.push('src/core/pipeline-runtime.mjs: expected compatibility re-export facade');
  if (/from ['"].*\\b(team|qa|research|ppt|image-ux-review|db|gx)\\b/i.test(text)) failures.push('src/core/pipeline-runtime.mjs: imports route implementation modules directly');
}

if (failures.length) {
  console.error('Pipeline runtime check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Pipeline runtime check passed');
