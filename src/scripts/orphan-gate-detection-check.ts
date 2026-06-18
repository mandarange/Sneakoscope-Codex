import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, readJson, root } from './sks-1-18-gate-lib.js';

interface ReleaseGate {
  id: string;
  command: string;
}

const pkg = readJson('package.json') as { scripts?: Record<string, string> };
const scripts = pkg.scripts || {};
const gates = (readJson('release-gates.v2.json').gates || []) as ReleaseGate[];
const gateScripts = new Set(gates.map((gate) => scriptNameForCommand(gate.command)).filter((value): value is string => Boolean(value)));
const missing = gates
  .map((gate) => ({ id: gate.id, script: scriptNameForCommand(gate.command) }))
  .filter((row) => row.script && !scripts[row.script]);
const releaseLike = Object.keys(scripts).filter((name) => /^(release|triwiki|gate-pack|scheduler|doctor|legacy|orphan|sks:40|certificate|build-once|sksd|probes)/.test(name));
const packageScriptOrphans = releaseLike.filter((name) => !gateScripts.has(name) && !allowedNonRelease(name));
const missingSourceTargets = Object.entries(scripts)
  .map(([name, script]) => ({ name, source: sourceTargetForScript(script) }))
  .filter((row) => row.source && !fs.existsSync(path.join(root, row.source)))
  .map((row) => ({ script: row.name, source: row.source as string }));
const missingDistTargets = Object.entries(scripts)
  .map(([name, script]) => ({ name, dist: distTargetForScript(script) }))
  .filter((row) => row.dist && fs.existsSync(path.join(root, 'dist')) && !fs.existsSync(path.join(root, row.dist)))
  .map((row) => ({ script: row.name, dist: row.dist as string }));
const sourceScriptOrphans = fs.readdirSync(path.join(root, 'src', 'scripts'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => `src/scripts/${name}`)
  .filter((file) => /\/(release|triwiki|gate-pack|scheduler|doctor|legacy|orphan|sks-40|certificate|build-once|sksd|probe)/.test(file))
  .filter((file) => !Object.values(scripts).some((script) => sourceTargetForScript(script) === file) && !allowedSourceHelper(file));
const report = {
  missing_script: missing,
  package_script_orphan: packageScriptOrphans,
  source_script_orphan: sourceScriptOrphans,
  missing_source_target: missingSourceTargets,
  missing_dist_target: missingDistTargets,
  allowed_non_release: releaseLike.filter(allowedNonRelease)
};
assertGate(missing.length === 0 && missingSourceTargets.length === 0 && missingDistTargets.length === 0, 'release/package script orphan detection failed', report);
emitGate('orphan:gate-detection', { checked: gates.length, ...Object.fromEntries(Object.entries(report).map(([key, value]) => [key, value.length])) });

function scriptNameForCommand(command: string): string | null {
  return command.match(/^npm run ([^ ]+)/)?.[1] || null;
}

function distTargetForScript(script: string | undefined): string | null {
  const match = String(script || '').match(/node\s+\.\/dist\/scripts\/([^\s]+\.js)/);
  return match ? `dist/scripts/${match[1]}` : null;
}

function sourceTargetForScript(script: string | undefined): string | null {
  const dist = distTargetForScript(script);
  return dist ? dist.replace(/^dist\/scripts\//, 'src/scripts/').replace(/\.js$/, '.ts') : null;
}

function allowedNonRelease(name: string): boolean {
  return /^(release:check|release:publish|release:speed-summary:report)$/.test(name);
}

function allowedSourceHelper(file: string): boolean {
  return /required-gates|gate-lib|check-lib|readiness-report|speed-summary|github-release-body-helper/.test(file);
}
