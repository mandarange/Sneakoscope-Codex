#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'src', 'core', 'commands');
const failures = [];
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('-command.mjs'))) {
  const absolute = path.join(dir, file);
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const imports = [...text.matchAll(/^\s*import\s+/gm)].length;
  if (lines > 1200) failures.push(`${file}: line count ${lines} > 1200`);
  if (imports > 35) failures.push(`${file}: import count ${imports} > 35`);
}
if (failures.length) {
  console.error('Command module budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Command module budget check passed');
