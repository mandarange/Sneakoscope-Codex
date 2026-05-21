#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installManagedCodexHooks } from '../dist/core/codex-hooks/codex-hook-managed-install.js';
import { readCodexHookActualState } from '../dist/core/codex-hooks/codex-hook-actual-discovery.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hooks-managed-install-'));
const install = await installManagedCodexHooks(root);
const actual = await readCodexHookActualState(root);
const requirements = fs.readFileSync(path.join(root, '.codex', 'requirements.toml'), 'utf8');
const ok = install.ok
  && requirements.includes('allow_managed_hooks_only = true')
  && requirements.includes('[hooks]')
  && actual.entries.filter((entry) => entry.trust_status === 'Managed').length >= 10
  && actual.unsupported_handlers.length === 0
  && actual.dual_representation.length === 0;
console.log(JSON.stringify({ schema: 'sks.hooks-managed-install-fixture-check.v1', ok, install, actual_summary: { entries: actual.entries.length, unsupported_handlers: actual.unsupported_handlers.length, dual_representation: actual.dual_representation.length } }, null, 2));
if (!ok) process.exitCode = 1;
