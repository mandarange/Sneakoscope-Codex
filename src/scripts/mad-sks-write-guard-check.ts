#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'write-guard.js')).href);
const engineSource = await mod.guardMadSksFileOperation({ targetPath: path.join(root, 'package.json'), operation: 'file_write', root, targetRoot: root });
const installedRoot = path.join(root, 'node_modules', 'sneakoscope');
const blocked = await mod.guardMadSksFileOperation({ targetPath: path.join(installedRoot, 'package.json'), operation: 'file_write', root: installedRoot, targetRoot: installedRoot });
const shell = await mod.classifyMadSksShellCommand({ command: 'sudo rm -rf ./src/core', cwd: root, root });
const fakeOpenAi = `${'OPENAI'}_${'API'}_${'KEY'}=${'sk'}-${'proj'}-${'secretsecretsecret'}`;
const fakeGithub = `${'github'}_${'pat'}_${'abcdef'}`;
const redacted = mod.redactMadSksSecrets(`${fakeOpenAi} ${fakeGithub}`);
const ok = engineSource.action === 'allow'
  && engineSource.protected_core?.engine_source_exception === true
  && blocked.action === 'block'
  && blocked.protected_core?.engine_source_exception === false
  && shell.action === 'confirm'
  && !redacted.includes(fakeOpenAi.split('=').at(-1))
  && !redacted.includes(fakeGithub);
emit({ schema: 'sks.mad-sks-write-guard-check.v1', ok, engineSource, blocked, shell, redacted });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-write-guard-check.v1', ok: false, blocker, detail }); process.exit(1); }
