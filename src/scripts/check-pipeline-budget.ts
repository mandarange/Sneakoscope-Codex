#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures: string[] = [];
const facade = path.join(root, 'src', 'core', 'pipeline.ts');
const facadeLines = lineCount(facade);
if (facadeLines > 200) failures.push(`src/core/pipeline.ts: line count ${facadeLines} > 200`);
const facadeText = fs.readFileSync(facade, 'utf8');
for (const exportName of [
  'buildPipelinePlan',
  'writePipelinePlan',
  'validatePipelinePlan',
  'promptPipelineContext',
  'prepareRoute',
  'activeRouteContext',
  'evaluateStop'
]) {
  if (!facadeText.includes(exportName)) failures.push(`src/core/pipeline.ts: missing exported pipeline API ${exportName}`);
}

const runtimeFacade = path.join(root, 'src', 'core', 'pipeline-runtime.ts');
if (fs.existsSync(runtimeFacade)) {
  const runtimeLines = lineCount(runtimeFacade);
  if (runtimeLines > 300) failures.push(`src/core/pipeline-runtime.ts: line count ${runtimeLines} > 300`);
  const text = fs.readFileSync(runtimeFacade, 'utf8');
  if (/from ['"].*\\b(team|qa|research|ppt|image-ux-review|db|gx)\\b/i.test(text)) {
    failures.push('src/core/pipeline-runtime.ts: compatibility facade imports route implementation modules directly');
  }
}

const moduleDir = path.join(root, 'src', 'core', 'pipeline');
const moduleFiles = fs.readdirSync(moduleDir).filter((name) => name.endsWith('.ts'));
if (moduleFiles.length < 8) failures.push(`src/core/pipeline: split module count ${moduleFiles.length} < 8`);
for (const file of moduleFiles) {
  const absolute = path.join(moduleDir, file);
  const lines = lineCount(absolute);
  if (lines > 1000) failures.push(`src/core/pipeline/${file}: line count ${lines} > 1000`);
  const imports = fs.readFileSync(absolute, 'utf8').match(/\\bfrom\\s+['"][^'"]+['"]/g) || [];
  if (imports.length > 35) failures.push(`src/core/pipeline/${file}: import count ${imports.length} > 35`);
}

if (failures.length) {
  console.error('Pipeline budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Pipeline budget check passed');

function lineCount(file: string): number {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
}
