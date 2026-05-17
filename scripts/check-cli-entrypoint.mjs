#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mainPath = path.join(root, 'src', 'cli', 'main.mjs');
const registryPath = path.join(root, 'src', 'cli', 'command-registry.mjs');
const main = await fs.readFile(mainPath, 'utf8');
const registry = await fs.readFile(registryPath, 'utf8');

const imports = [...main.matchAll(/^import\s+/gm)];
const lineCount = main.split(/\r?\n/).length;
const heavy = [
  '../core/routes.mjs',
  './maintenance-commands.mjs',
  '../core/pipeline.mjs',
  '../core/research.mjs',
  '../core/ppt.mjs',
  '../core/image-ux-review.mjs',
  '../core/hooks-runtime.mjs'
].filter((needle) => main.includes(needle));
const issues = [];
if (imports.length > 2) issues.push(`main_import_count:${imports.length}`);
if (lineCount > 25) issues.push(`main_line_count:${lineCount}`);
for (const item of heavy) issues.push(`heavy_import:${item}`);
if (!/lazy:\s*\(\)\s*=>\s*import\(/.test(registry)) issues.push('registry_lazy_import_missing');
if (!registry.includes('legacy-main.mjs')) issues.push('legacy_fallback_missing');

if (issues.length) {
  console.error(`CLI entrypoint check failed: ${issues.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('CLI entrypoint check passed');
}
