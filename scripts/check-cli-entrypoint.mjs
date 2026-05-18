#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mainPath = path.join(root, 'src', 'cli', 'main.ts');
const registryPath = path.join(root, 'src', 'cli', 'command-registry.ts');
const main = await fs.readFile(mainPath, 'utf8');
const registry = await fs.readFile(registryPath, 'utf8');
const oldMaintenanceModule = ['maintenance', 'commands.mjs'].join('-');
const oldMainModule = ['legacy', 'main.mjs'].join('-');
const oldLazyShape = ['lazy:', 'legacy'].join(' ');

const imports = [...main.matchAll(/^import\s+/gm)];
const lineCount = main.split(/\r?\n/).length;
const heavy = [
  '../core/routes.js',
  `./${oldMaintenanceModule}`,
  `./${oldMainModule}`,
  '../core/pipeline.js',
  '../core/research.js',
  '../core/ppt.js',
  '../core/image-ux-review.js',
  '../core/hooks-runtime.js'
].filter((needle) => main.includes(needle));
const issues = [];
if (imports.length > 2) issues.push(`main_import_count:${imports.length}`);
if (lineCount > 25) issues.push(`main_line_count:${lineCount}`);
for (const item of heavy) issues.push(`heavy_import:${item}`);
if (!/\bimport\(/.test(registry)) issues.push('registry_lazy_import_missing');
if (registry.includes(oldMainModule) || registry.includes(oldLazyShape)) issues.push('legacy_fallback_present');

if (issues.length) {
  console.error(`CLI entrypoint check failed: ${issues.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('CLI entrypoint check passed');
}
