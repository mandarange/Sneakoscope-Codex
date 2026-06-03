#!/usr/bin/env node
// @ts-nocheck
import { validateCodexHookConfigFiles } from '../core/codex-compat/codex-config-policy.js';

const report = await validateCodexHookConfigFiles(process.cwd());
const unsupported = report.issues.filter((issue) => /unsupported_hook_handler|async_hook_not_supported|empty_hook_command|invalid_matcher|hooks_json_and_config_toml_hooks_both_present/.test(issue));
const ok = unsupported.length === 0;
console.log(JSON.stringify({
  schema: 'sks.hooks-no-unsupported-handlers.v1',
  ok,
  unsupported,
  issues: report.issues
}, null, 2));
if (!ok) process.exitCode = 1;
