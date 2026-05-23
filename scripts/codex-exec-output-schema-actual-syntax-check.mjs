#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) {
  console.log(JSON.stringify({ schema: 'sks.codex-exec-output-schema-actual-syntax-check.v1', ok: false, blocker: 'dist_not_fresh', freshness }, null, 2));
  process.exit(1);
}

const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex-exec-output-schema.js')).href);
const syntax = await mod.detectCodexExecOutputSchemaSyntax();
const schemaPath = path.join(root, 'schemas', 'codex', 'scout-result.schema.json');
const freshArgs = await mod.buildCodexExecOutputSchemaArgs({ prompt: 'Return {}', outputSchemaPath: schemaPath, outputFile: path.join(root, '.sneakoscope', 'tmp', 'codex-fresh.json') });
const resumeArgs = await mod.buildCodexExecResumeOutputSchemaArgs({ sessionId: 'fixture-session', prompt: 'Return {}', outputSchemaPath: schemaPath, outputFile: path.join(root, '.sneakoscope', 'tmp', 'codex-resume.json') });
const report = {
  schema: 'sks.codex-exec-output-schema-actual-syntax-check.v1',
  ok: syntax.ok && (syntax.status === 'integration_optional' || syntax.exec.output_schema_supported || syntax.resume.output_schema_supported),
  syntax,
  exec_args_prefix: freshArgs.slice(0, 4),
  resume_args_prefix: resumeArgs.slice(0, 5),
  exec_output_schema_supported: syntax.exec.output_schema_supported,
  exec_resume_output_schema_supported: syntax.resume.output_schema_supported,
  degraded_supported: syntax.status === 'degraded_supported'
};
const out = path.join(root, '.sneakoscope', 'reports', 'codex-exec-output-schema-actual-syntax.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
