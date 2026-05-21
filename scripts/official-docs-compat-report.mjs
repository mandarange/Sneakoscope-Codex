#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const jsonPath = path.join(reportDir, 'official-docs-compat-1.13.0.json');
const mdPath = path.join(reportDir, 'official-docs-compat-1.13.0.md');

const sources = {
  codex_release: 'https://github.com/openai/codex/releases/tag/rust-v0.132.0',
  image_generation: 'https://developers.openai.com/api/docs/guides/image-generation',
  gpt_image_2_model: 'https://developers.openai.com/api/docs/models/gpt-image-2',
  structured_outputs: 'https://developers.openai.com/api/docs/guides/structured-outputs'
};

const checks = [
  row('codex_exec_resume_output_schema', 'rust-v0.132.0', 'src/core/codex-exec-output-schema.ts', ['runCodexExecResumeWithOutputSchema', '--output-schema', '--output-last-message']),
  row('scout_output_schema_runner', 'rust-v0.132.0', 'src/core/scouts/scout-output-parser.ts', ['runCodexExecResumeWithOutputSchema', 'scout-result']),
  row('completion_proof_output_schema_runner', 'rust-v0.132.0', 'src/core/proof/proof-writer.ts', ['generateCompletionProofWithOutputSchema', 'completion-proof']),
  row('wrongness_output_schema_runner', 'rust-v0.132.0', 'src/core/triwiki-wrongness/wrongness-ledger.ts', ['extractWrongnessWithOutputSchema', 'wrongness-record']),
  row('codex_app_server_image_fidelity', 'rust-v0.132.0', 'src/core/image-ux-review.ts', ['high_fidelity_automatic', 'image_size_relation']),
  row('codex_memory_summary_rebuild', 'rust-v0.132.0', 'scripts/memory-summary-rebuild-check.mjs', ['memory-summary']),
  row('codex_repeated_blocker_stop', 'rust-v0.132.0', 'src/core/image-ux-review/fix-loop.ts', ['repeated_blocker_stop']),
  row('gpt_image_2_generation_edit', 'OpenAI Image Generation docs', 'src/core/image-ux-review/imagegen-adapter.ts', ['gpt-image-2', '/v1/images/edits', 'FormData']),
  row('gpt_image_2_high_fidelity_auto', 'OpenAI Image Generation docs', 'src/core/image-ux-review/imagegen-adapter.ts', ['high_fidelity_automatic', 'input_fidelity']),
  row('structured_outputs_strict_schema', 'OpenAI Structured Outputs docs', 'src/core/structured-output-adapter.ts', ['json_schema', 'strict', 'additionalProperties'])
];

const warnings = [];
for (const check of checks) {
  if (!check.ok) warnings.push(`${check.feature}:${check.missing.join(',')}`);
}

const report = {
  schema: 'sks.official-docs-compat.v1',
  generated_at: new Date().toISOString(),
  codex_release_baseline: 'rust-v0.132.0',
  openai_image_generation_docs_baseline: sources.image_generation,
  openai_structured_outputs_docs_baseline: sources.structured_outputs,
  rules: {
    gpt_image_2_image_input_fidelity: 'high_fidelity_automatic; omit unsupported input_fidelity',
    structured_outputs: 'prefer strict json_schema/text.format when schema adherence matters',
    codex_output_schema: 'prefer codex exec resume --output-schema for session-preserving structured extraction'
  },
  sources,
  checks,
  warnings,
  ok: checks.every((check) => check.ok)
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdPath, renderMarkdown(report));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function row(feature, baseline, relFile, needles) {
  const file = path.join(root, relFile);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const missing = needles.filter((needle) => !text.includes(needle));
  return {
    feature,
    baseline,
    file: relFile,
    status: missing.length ? 'warning' : 'mapped',
    ok: missing.length === 0,
    missing,
    release_readiness: true
  };
}

function renderMarkdown(report) {
  const lines = [
    '# SKS 1.13.0 Official Docs Compatibility',
    '',
    `- Schema: \`${report.schema}\``,
    `- Codex baseline: \`${report.codex_release_baseline}\``,
    `- Image docs: ${report.openai_image_generation_docs_baseline}`,
    `- Structured Outputs docs: ${report.openai_structured_outputs_docs_baseline}`,
    '',
    '| Feature | Baseline | Result |',
    '| --- | --- | --- |'
  ];
  for (const check of report.checks) lines.push(`| \`${check.feature}\` | ${check.baseline} | ${check.status} |`);
  lines.push('', `Warnings: ${report.warnings.length ? report.warnings.join(', ') : 'None'}`, '');
  return `${lines.join('\n')}\n`;
}
