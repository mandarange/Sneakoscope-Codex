#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const schemas = [
  'schemas/codex/image-ux-issue-ledger.schema.json',
  'schemas/codex/ppt-slide-issue-ledger.schema.json',
  'schemas/codex/ppt-slide-extraction-report.schema.json'
].map((rel) => ({ rel, json: JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')) }));
const checks = schemas.map(({ rel, json }) => ({
  rel,
  root_strict: json.additionalProperties === false,
  issue_strict: rel.includes('extraction-report')
    ? json.properties.slide_reports.items.additionalProperties === false
    : (json.properties.issues.items.additionalProperties === false || json.$defs?.issue?.additionalProperties === false)
}));
const ok = checks.every((check) => check.root_strict && check.issue_strict);
console.log(JSON.stringify({ schema: 'sks.ux-ppt-structured-extraction-check.v1', ok, checks }, null, 2));
if (!ok) process.exitCode = 1;
