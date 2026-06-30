#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexProviderModelUiStatus, formatCodexAppStatus } from '../core/codex-app.js';
import { GLM_CODEX_CONFIG_PROVIDER_ID, GLM_CODEX_CONFIG_REASONING_PROFILES } from '../core/codex-app/glm-model-profile.js';
import { GLM_52_OPENROUTER_MODEL } from '../core/providers/glm/glm-52-settings.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-app-provider-ui-'));
const home = path.join(tmp, 'home');
const cwd = path.join(tmp, 'project');
await fs.mkdir(path.join(home, '.codex'), { recursive: true });
await fs.mkdir(path.join(cwd, '.codex'), { recursive: true });

const missing = await codexProviderModelUiStatus({ home, cwd, env: { HOME: home } as any });
const missingText = formatCodexAppStatus(statusFixture(missing));

await fs.writeFile(path.join(home, '.codex', 'config.toml'), readyConfig(), 'utf8');
await fs.writeFile(
  path.join(home, '.codex', 'sks-codex-lb.env'),
  "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-codex-lb-fixture'\n",
  'utf8'
);
const ready = await codexProviderModelUiStatus({
  home,
  cwd,
  env: { HOME: home, OPENROUTER_API_KEY: 'sk-or-fixture' } as any
});
const readyText = formatCodexAppStatus(statusFixture(ready));

const ok = missing.ok === false
  && missing.glm.exposed === false
  && missing.codex_lb.key_entry_visible === true
  && missing.ui_actions.includes('sks codex-app set-openrouter-key --api-key-stdin')
  && missing.ui_actions.includes('sks codex-lb setup --host <domain> --api-key-stdin --yes')
  && /Provider UI:\s*setup/.test(missingText)
  && /GLM Model:\s*setup/.test(missingText)
  && /codex-lb Key:\s*missing \(input: sks codex-lb setup/.test(missingText)
  && ready.ok === true
  && ready.glm.exposed === true
  && ready.glm.model === GLM_52_OPENROUTER_MODEL
  && ready.glm.profiles_present.length === GLM_CODEX_CONFIG_REASONING_PROFILES.length
  && ready.codex_lb.provider_present === true
  && ready.codex_lb.key_present === true
  && /Provider UI:\s*ok/.test(readyText)
  && readyText.includes(`GLM Model:  ok ${GLM_52_OPENROUTER_MODEL}`)
  && /codex-lb Key:\s*configured/.test(readyText)
  && !JSON.stringify({ missing, ready, missingText, readyText }).includes('sk-codex-lb-fixture');

emit({
  schema: 'sks.codex-app-provider-model-ui-check.v1',
  ok,
  missing,
  ready,
  secret_safe: !JSON.stringify({ missing, ready, missingText, readyText }).includes('sk-codex-lb-fixture'),
  blockers: ok ? [] : ['codex_app_provider_model_ui_check_failed']
});

function readyConfig() {
  return [
    `[model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}]`,
    'name = "OpenRouter"',
    'base_url = "https://openrouter.ai/api/v1"',
    'wire_api = "responses"',
    'env_key = "OPENROUTER_API_KEY"',
    'requires_openai_auth = false',
    '',
    ...GLM_CODEX_CONFIG_REASONING_PROFILES.flatMap((profile) => [
      `[profiles.${profile.id}]`,
      `model_provider = "${GLM_CODEX_CONFIG_PROVIDER_ID}"`,
      `model = "${GLM_52_OPENROUTER_MODEL}"`,
      `model_reasoning_effort = "${profile.reasoning_effort}"`,
      'service_tier = "default"',
      'approval_policy = "on-request"',
      ''
    ]),
    '[model_providers.codex-lb]',
    'name = "openai"',
    'base_url = "https://lb.example.test/backend-api/codex"',
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true',
    ''
  ].join('\n');
}

function statusFixture(providerModelUi: any) {
  return {
    ok: providerModelUi.ok,
    app: { installed: true, path: '/Applications/Codex.app' },
    codex_cli: { ok: true, version: '0.142.0' },
    remote_control: { ok: true, min_version: '0.130.0', codex_cli: { version_number: '0.142.0' } },
    features: {
      checked: true,
      required_flags_ok: true,
      required_flags: {},
      fast_mode_config: { ok: true, blockers: [] },
      provider_model_ui: providerModelUi,
      git_actions: { ok: true, blockers: [] },
      browser_tool_ready: true,
      browser_tool_source: 'fixture',
      image_generation: true
    },
    plugins: {
      default_plugins: { ok: true },
      design_product: { ok: true, id: 'product-design' },
      picker: { ok: true }
    },
    chrome_extension: { ok: true, blockers: [] },
    mcp: {
      has_computer_use: true,
      computer_use_source: 'mcp_list',
      has_browser_use: true,
      browser_use_source: 'mcp_list'
    },
    guidance: []
  };
}

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
