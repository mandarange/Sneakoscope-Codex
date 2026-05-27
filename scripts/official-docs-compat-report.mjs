#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const reportDir = path.join(root, '.sneakoscope', 'reports');
const RELEASE_VERSION = pkg.version;
const jsonPath = path.join(reportDir, `official-docs-compat-${RELEASE_VERSION}.json`);
const mdPath = path.join(reportDir, `official-docs-compat-${RELEASE_VERSION}.md`);

const sources = {
  codex_release: 'https://github.com/openai/codex/releases/tag/rust-v0.134.0',
  codex_0133_release: 'https://github.com/openai/codex/releases/tag/rust-v0.133.0',
  codex_config_schema: 'https://raw.githubusercontent.com/openai/codex/rust-v0.134.0/codex-rs/core/config.schema.json',
  codex_hook_schema_listing: 'https://api.github.com/repos/openai/codex/contents/codex-rs/hooks/schema/generated?ref=rust-v0.134.0',
  codex_chrome_extension: 'https://developers.openai.com/codex/app/chrome-extension',
  codex_app_image_generation: 'https://developers.openai.com/codex/app/features#image-generation',
  chatgpt_images_2: 'https://openai.com/index/introducing-chatgpt-images-2-0/',
  chatgpt_images_2_safety_card: 'https://deploymentsafety.openai.com/chatgpt-images-2-0',
  image_generation: 'https://developers.openai.com/api/docs/guides/image-generation',
  gpt_image_2_model: 'https://developers.openai.com/api/docs/models/gpt-image-2',
  structured_outputs: 'https://developers.openai.com/api/docs/guides/structured-outputs'
};

const codex0134ReleaseApi = 'https://api.github.com/repos/openai/codex/releases/tags/rust-v0.134.0';
const codex0134Release = await fetchJson(codex0134ReleaseApi);
const codex0134ReleaseBody = String(codex0134Release.json?.body || '');
const codexConfigSchema = await fetchText(sources.codex_config_schema);
const codexHookSchemaListing = await fetchText(sources.codex_hook_schema_listing, { accept: 'application/vnd.github+json' });
const codexChromeExtension = await fetchText(sources.codex_chrome_extension);
const codexAppImageGeneration = await fetchText(sources.codex_app_image_generation);
const chatgptImages2SafetyCard = await fetchText(sources.chatgpt_images_2_safety_card);
const openaiImageGeneration = await fetchText(sources.image_generation);
const gptImage2Model = await fetchText(sources.gpt_image_2_model);
const structuredOutputs = await fetchText(sources.structured_outputs);
const sourceValidations = [
  sourceRow('codex_release', sources.codex_release, codex0134Release, codex0134ReleaseBody, [
    'search across local conversation history',
    '--profile',
    'per-server environment targeting',
    'OAuth options',
    'subagent identity in hook inputs',
    'managed network proxy environment'
  ]),
  sourceRow('codex_config_schema', sources.codex_config_schema, codexConfigSchema, codexConfigSchema.body || '', [
    '$ref',
    'definitions',
    'mcp_servers',
    'profiles'
  ]),
  sourceRow('codex_hook_schema_listing', sources.codex_hook_schema_listing, codexHookSchemaListing, codexHookSchemaListing.body || '', [
    'subagent-start.command.input.schema.json',
    'subagent-stop.command.input.schema.json',
    'permission-request.command.input.schema.json'
  ]),
  sourceRow('codex_chrome_extension', sources.codex_chrome_extension, codexChromeExtension, codexChromeExtension.body || '', [
    'Chrome extension',
    'Codex',
    'browser'
  ]),
  sourceRow('codex_app_image_generation', sources.codex_app_image_generation, codexAppImageGeneration, codexAppImageGeneration.body || '', [
    'Image generation',
    '$imagegen',
    'gpt-image-2'
  ]),
  sourceRow('chatgpt_images_2_safety_card', sources.chatgpt_images_2_safety_card, chatgptImages2SafetyCard, chatgptImages2SafetyCard.body || '', [
    'ChatGPT Images 2.0',
    'image generation',
    'thinking mode'
  ]),
  sourceRow('image_generation', sources.image_generation, openaiImageGeneration, openaiImageGeneration.body || '', [
    'Image generation',
    'gpt-image-2',
    'GPT Image'
  ]),
  sourceRow('gpt_image_2_model', sources.gpt_image_2_model, gptImage2Model, gptImage2Model.body || '', [
    'gpt-image-2',
    'Image generation',
    'GPT Image'
  ]),
  sourceRow('structured_outputs', sources.structured_outputs, structuredOutputs, structuredOutputs.body || '', [
    'Structured Outputs',
    'json_schema',
    'strict'
  ])
];

const checks = [
  row('codex_0134_release_matrix', 'rust-v0.134.0', 'src/core/codex/codex-0-134-compat.ts', ['rust-v0.134.0', 'profile_primary_selector', 'local_conversation_history_search', 'mcp_readonly_parallel_hint', 'managed_network_proxy_env']),
  row('codex_0134_official_compat_report', 'rust-v0.134.0', 'scripts/codex-0-134-official-compat-report.mjs', ['sks.codex-0-134-official-compat.v1', 'release_source_url', 'source_delta']),
  row('codex_0134_profile_primary', 'rust-v0.134.0', 'src/core/agents/agent-runner-codex-exec.ts', ['--profile', '--ignore-user-config', 'profile: opts.profile']),
  row('codex_0134_managed_proxy_env', 'rust-v0.134.0', 'src/core/codex/managed-proxy-env.ts', ['MANAGED_PROXY_ENV_KEYS', 'HTTPS_PROXY', 'redactProxyValue']),
  row('codex_0134_history_search', 'rust-v0.134.0', 'src/core/source-intelligence/codex-history-search.ts', ['CODEX_HISTORY_SEARCH_SCHEMA', 'case_insensitive', 'redactPreview']),
  row('mcp_0134_modernization', 'rust-v0.134.0', 'src/core/mcp/mcp-0-134-policy.ts', ['readOnlyHint', 'candidate_parallel_readonly', '$defs', 'oauth_configured']),
  row('codex_0133_release_matrix', 'rust-v0.133.0', 'src/core/codex-compat/codex-0-133.ts', ['rust-v0.133.0', 'goals_default_enabled', 'remote_control_foreground_app_server', 'permission_profiles_requirements']),
  row('codex_0133_official_compat_report', 'rust-v0.133.0', 'scripts/codex-0-133-official-compat-report.mjs', ['sks.codex-0-133-official-compat.v1', 'release_source_url', 'structured_output_inheritance']),
  row('hook_official_hash_oracle', 'OpenAI Codex hook trust', 'src/core/codex-hooks/codex-hook-official-hash-oracle.ts', ['sks.codex-hook-hash-oracle.v1', 'golden-fixture', 'unavailable']),
  row('agent_multisession_output_schema', 'Codex 0.133 exec --output-schema', 'src/core/agents/agent-runner-codex-exec.ts', ['--output-schema', 'agent-result.schema.json', 'session_id']),
  row('codex_plugin_discovery_marketplaces', 'rust-v0.133.0', 'src/core/codex-compat/codex-0-133.ts', ['plugin_discovery_marketplaces', 'plugins and marketplaces']),
  row('codex_extension_lifecycle_events', 'rust-v0.133.0', 'src/core/codex-compat/codex-0-133.ts', ['extension_lifecycle_events', 'turn/tool/model/item phases']),
  row('codex_exec_resume_output_schema', 'rust-v0.133.0', 'src/core/codex-exec-output-schema.ts', ['runCodexExecResumeWithOutputSchema', '--output-schema', '--output-last-message']),
  row('agent_output_schema_validator', 'rust-v0.133.0', 'src/core/agents/agent-worker-pipeline.ts', ['validateAgentWorkerResult', 'agent-result', 'schema']),
  row('completion_proof_output_schema_runner', 'rust-v0.133.0', 'src/core/proof/proof-writer.ts', ['generateCompletionProofWithOutputSchema', 'completion-proof']),
  row('wrongness_output_schema_runner', 'rust-v0.133.0', 'src/core/triwiki-wrongness/wrongness-ledger.ts', ['extractWrongnessWithOutputSchema', 'wrongness-record']),
  row('codex_app_server_image_fidelity', 'rust-v0.133.0', 'src/core/image-ux-review.ts', ['high_fidelity_automatic', 'image_size_relation']),
  row('codex_memory_summary_rebuild', 'rust-v0.133.0', 'scripts/memory-summary-rebuild-check.mjs', ['memory-summary']),
  row('codex_repeated_blocker_stop', 'rust-v0.133.0', 'src/core/image-ux-review/fix-loop.ts', ['repeated_blocker_stop']),
  row('codex_app_imagegen_evidence_policy', 'Codex App image generation docs', 'src/core/imagegen/imagegen-capability.ts', ['Codex App $imagegen', 'codex_app_builtin_output_required', 'capability_detection_is_not_output_proof', 'official_codex_app_substitute']),
  row('codex_chrome_extension_web_verification_policy', 'Codex Chrome Extension docs', 'src/core/routes.ts', ['CODEX_CHROME_EXTENSION_DOC_URL', 'CODEX_WEB_VERIFICATION_POLICY', 'CODEX_WEB_VERIFICATION_EVIDENCE_SOURCE']),
  row('chatgpt_images_2_prompt_policy', 'ChatGPT Images 2.0 announcement + gpt-image-2 docs', 'src/core/routes.ts', ['OPENAI_CHATGPT_IMAGES_2_DOC_URL', 'ChatGPT Images 2.0 / GPT Image 2.0 with gpt-image-2', 'IMAGEGEN_SOCIAL_SOURCE_POLICY']),
  row('gpt_image_2_generation_edit', 'OpenAI Image Generation docs', 'src/core/image-ux-review/imagegen-adapter.ts', ['gpt-image-2', '/v1/images/edits', 'FormData']),
  row('gpt_image_2_high_fidelity_auto', 'OpenAI Image Generation docs', 'src/core/image-ux-review/imagegen-adapter.ts', ['high_fidelity_automatic', 'input_fidelity']),
  row('structured_outputs_strict_schema', 'OpenAI Structured Outputs docs', 'src/core/structured-output-adapter.ts', ['json_schema', 'strict', 'additionalProperties'])
];

const warnings = [];
for (const check of checks) {
  if (!check.ok) warnings.push(`${check.feature}:${check.missing.join(',')}`);
}
for (const source of sourceValidations) {
  if (!source.ok) warnings.push(`${source.feature}:${source.missing.join(',') || source.error || 'source_unavailable'}`);
}

const report = {
  schema: 'sks.official-docs-compat.v1',
  generated_at: new Date().toISOString(),
  codex_release_baseline: 'rust-v0.134.0',
  codex_inherited_baselines: ['rust-v0.133.0', 'rust-v0.132.0'],
  codex_app_image_generation_docs_baseline: sources.codex_app_image_generation,
  codex_chrome_extension_docs_baseline: sources.codex_chrome_extension,
  chatgpt_images_2_docs_baseline: sources.chatgpt_images_2_safety_card,
  chatgpt_images_2_announcement_reference: sources.chatgpt_images_2,
  openai_image_generation_docs_baseline: sources.image_generation,
  openai_structured_outputs_docs_baseline: sources.structured_outputs,
  rules: {
    gpt_image_2_image_input_fidelity: 'high_fidelity_automatic; omit unsupported input_fidelity',
    chatgpt_images_2_prompting: 'Codex App image prompts should explicitly request ChatGPT Images 2.0 / GPT Image 2.0 with gpt-image-2 when newest-model output is required',
    codex_app_imagegen_evidence: 'full SKS visual evidence requires Codex App $imagegen output; API fallbacks are non-Codex evidence',
    codex_chrome_extension_web_verification: 'web/browser/webapp verification uses Codex Chrome Extension first; Computer Use is native Mac/non-web only',
    structured_outputs: 'prefer strict json_schema/text.format when schema adherence matters',
    codex_output_schema: 'prefer codex exec resume --output-schema for session-preserving structured extraction'
  },
  sources,
  source_validations: sourceValidations,
  checks,
  warnings,
  ok: checks.every((check) => check.ok) && sourceValidations.every((source) => source.ok)
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

function sourceRow(feature, url, fetchResult, body, needles) {
  const missing = fetchResult.ok ? needles.filter((needle) => !body.includes(needle)) : needles;
  return {
    feature,
    url,
    status_code: fetchResult.statusCode || null,
    status: fetchResult.ok && missing.length === 0 ? 'verified' : 'warning',
    ok: fetchResult.ok === true && missing.length === 0,
    missing,
    error: fetchResult.error || null
  };
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'sneakoscope-official-docs-check',
        Accept: 'application/vnd.github+json'
      },
      timeout: 20000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, json });
        } catch (err) {
          resolve({ ok: false, statusCode: res.statusCode, error: err.message, body: body.slice(0, 1000) });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

function fetchText(url, opts = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': opts.userAgent || 'sneakoscope-official-docs-check',
        Accept: opts.accept || 'text/html,application/json,text/plain,*/*'
      },
      timeout: 20000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          body,
          error: res.statusCode >= 200 && res.statusCode < 300 ? null : `http_${res.statusCode}`
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, body: '' });
    });
  });
}

function renderMarkdown(report) {
  const lines = [
    `# SKS ${RELEASE_VERSION} Official Docs Compatibility`,
    '',
    `- Schema: \`${report.schema}\``,
    `- Codex baseline: \`${report.codex_release_baseline}\``,
    `- ChatGPT Images 2.0 docs: ${report.chatgpt_images_2_docs_baseline}`,
    `- Image docs: ${report.openai_image_generation_docs_baseline}`,
    `- Structured Outputs docs: ${report.openai_structured_outputs_docs_baseline}`,
    '',
    '| Feature | Baseline | Result |',
    '| --- | --- | --- |'
  ];
  for (const check of report.checks) lines.push(`| \`${check.feature}\` | ${check.baseline} | ${check.status} |`);
  lines.push('', '| Official Source | Result |', '| --- | --- |');
  for (const source of report.source_validations) lines.push(`| \`${source.feature}\` | ${source.status} |`);
  lines.push('', `Warnings: ${report.warnings.length ? report.warnings.join(', ') : 'None'}`, '');
  return `${lines.join('\n')}\n`;
}
