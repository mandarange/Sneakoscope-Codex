#!/usr/bin/env node
// @ts-nocheck
// Packs the checkout, unpacks the tarball into a throwaway directory, and lazy-loads
// every command the packed registry declares. A module the package excludes but a
// command still imports shows up here as a load failure instead of at a user's
// first run. Dependencies are linked from the checkout rather than installed, so the
// check needs no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const keep = process.argv.includes('--keep');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-command-import-smoke-'));
const failures = [];
let loaded = 0;
let declared = 0;
let version = null;

try {
  const pack = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work], {
    cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_loglevel: 'error' }
  });
  const tarball = fs.readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (pack.status !== 0 || !tarball) {
    failures.push({ step: 'npm_pack', detail: String(pack.stderr || pack.stdout || '').slice(-500) });
  } else {
    const extract = spawnSync('tar', ['xzf', path.join(work, tarball), '-C', work], { encoding: 'utf8' });
    if (extract.status !== 0) failures.push({ step: 'extract', detail: String(extract.stderr || '').slice(-500) });
    const packageDir = path.join(work, 'package');
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(packageDir, 'node_modules'), 'dir');
    version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
    const registry = await import(pathToFileURL(path.join(packageDir, 'dist', 'cli', 'command-registry.js')).href);
    for (const [name, entry] of Object.entries(registry.COMMANDS)) {
      declared += 1;
      try {
        const mod = await entry.lazy();
        if (typeof mod.run !== 'function') throw new Error('command module has no run()');
        loaded += 1;
      } catch (error) {
        failures.push({ step: 'load', command: name, detail: String(error?.message || error).slice(0, 300) });
      }
    }
  }
} catch (error) {
  failures.push({ step: 'unexpected', detail: String(error?.message || error).slice(0, 500) });
} finally {
  if (!keep) fs.rmSync(work, { recursive: true, force: true });
}

const report = {
  schema: 'sks.blackbox-command-import-smoke.v1',
  ok: failures.length === 0 && declared > 0 && loaded === declared,
  version,
  commands_declared: declared,
  commands_loaded: loaded,
  failures,
  ...(keep ? { temp_root: work } : {})
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
