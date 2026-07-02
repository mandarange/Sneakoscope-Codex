#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'src', 'core', 'pipeline-runtime.ts');
const failures = [];

if (fs.existsSync(file)) {
  failures.push('src/core/pipeline-runtime.ts: duplicate compatibility facade must be removed; use src/core/pipeline.ts');
}

if (failures.length) {
  console.error('Pipeline runtime check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Pipeline runtime check passed');
