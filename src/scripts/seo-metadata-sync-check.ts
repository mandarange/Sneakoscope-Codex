#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { COMMAND_MANIFEST_LITE } from '../cli/command-manifest-lite.js';
import { ROUTES, COMMAND_CATALOG } from '../core/routes.js';
import { DOLLAR_COMMANDS_LITE } from '../core/routes/dollar-manifest-lite.js';

const root = process.cwd();
const failures = [];
const required = ['research', 'strategy', '--include-marketing'];
const requiredLifecycle = ['marketing_research', 'source_backed_strategy', 'marketing_truthfulness_gate', 'marketing_mutation_plan'];
const route = ROUTES.find((entry) => entry.command === '$SEO-GEO-OPTIMIZER');
const command = COMMAND_CATALOG.find((entry) => entry.name === 'seo-geo-optimizer');
const liteCommand = COMMAND_MANIFEST_LITE.find((entry) => entry.name === 'seo-geo-optimizer');
const dollar = DOLLAR_COMMANDS_LITE.find((entry) => entry.command === '$sks-seo-geo-optimizer');
const seoCommandSource = read('src/core/commands/seo-command.ts');
const readme = read('README.md');

requireText('route.cliEntrypoint', route?.cliEntrypoint || '', required);
requireText('route.examples', JSON.stringify(route?.examples || []), required);
requireText('command.usage', command?.usage || '', required);
requireText('command-lite.summary', liteCommand?.summary || '', required);
requireText('dollar-lite.description', dollar?.description || '', required);
requireText('seo-command.usage', seoCommandSource, required);
requireText('seo-command.actions', seoCommandSource, ["action === 'research'", "action === 'strategy'", 'includeMarketing']);
for (const item of requiredLifecycle) {
  if (!route?.lifecycle?.includes(item)) failures.push(`route.lifecycle missing ${item}`);
}

if (/\|\s*seo-geo-optimizer\s*\|/i.test(readme)) {
  requireText('README command table', readme, required);
}

const result = {
  schema: 'sks.seo-metadata-sync-check.v1',
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  checked: {
    route: Boolean(route),
    command_catalog: Boolean(command),
    command_manifest_lite: Boolean(liteCommand),
    dollar_manifest_lite: Boolean(dollar),
    readme_command_table_present: /\|\s*seo-geo-optimizer\s*\|/i.test(readme),
  },
  failures,
  blockers: failures,
};

const reportPath = path.join(root, '.sneakoscope', 'reports', 'seo-metadata-sync.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function requireText(label, text, needles) {
  for (const needle of needles) {
    if (!String(text || '').includes(needle)) failures.push(`${label} missing ${needle}`);
  }
}

function read(rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}
