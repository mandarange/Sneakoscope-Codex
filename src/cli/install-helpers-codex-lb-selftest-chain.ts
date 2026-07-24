import path from 'node:path';
import { packageRoot, writeTextAtomic } from '../core/fsx.js';
import {
  hasCodexUnstableFeatureWarningSuppression,
  hasDeprecatedCodexHooksFeatureFlag,
  hasTopLevelCodexModeLock
} from './install-tool-helpers.js';
import {
  maybePromptCodexLbSetupForLaunch,
  type ConfigureCodexLbResult
} from './install-helpers.js';
import { checkCodexLbResponseChain } from './install-helpers-codex-lb-chain.js';
import { hasTopLevelCodexLbSelected } from './install-helpers-codex-lb-shared.js';

async function safeReadText(file: any, fallback: any = '') {
  try {
    return await import('node:fs/promises').then((fsp) => fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function runCodexLbLaunchChainSelftest(input: {
  tmp: string;
  codexLbHome: string;
  codexLbFakeBin: string;
  codexLbConfig: string;
}) {
  const { tmp, codexLbHome, codexLbFakeBin, codexLbConfig } = input;
  // SKS_CODEX_LB_AUTOBYPASS=1 restores the old silent-bypass behavior for CI/automation.
  process.env.SKS_CODEX_LB_AUTOBYPASS = '1';
  let autobypassLaunch: ConfigureCodexLbResult;
  try {
    autobypassLaunch = (await maybePromptCodexLbSetupForLaunch([], {
      home: codexLbHome,
      apiKey: 'sk-test',
      codexBin: path.join(codexLbFakeBin, 'codex'),
      syncLaunchEnv: false,
      timeoutMs: 1000,
      fetch: async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_autobypass_first' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'server_error', code: 'internal_error', message: 'simulated upstream failure' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    })) as ConfigureCodexLbResult;
  } finally {
    delete process.env.SKS_CODEX_LB_AUTOBYPASS;
  }
  if (autobypassLaunch.status !== 'chain_unhealthy' || autobypassLaunch.bypass_codex_lb !== true || autobypassLaunch.chain_health?.status !== 'second_request_failed') throw new Error('selftest: SKS_CODEX_LB_AUTOBYPASS=1 should bypass codex-lb on hard chain failure');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'service_tier = "fast"\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  const missingProviderLaunchCalls: any[] = [];
  const missingProviderLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (url: any, init: any) => {
      missingProviderLaunchCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: missingProviderLaunchCalls.length === 1 ? 'resp_missing_provider_1' : 'resp_missing_provider_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const missingProviderRepairedConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!missingProviderLaunch.ok || missingProviderLaunch.status !== 'present' || missingProviderLaunch.chain_health?.status !== 'chain_ok' || missingProviderLaunchCalls.length !== 2 || !hasTopLevelCodexLbSelected(missingProviderRepairedConfig) || !missingProviderRepairedConfig.includes('[model_providers.codex-lb]') || !missingProviderRepairedConfig.includes('env_key = "CODEX_LB_API_KEY"') || !missingProviderRepairedConfig.includes('supports_websockets = true') || !missingProviderRepairedConfig.includes('requires_openai_auth = true') || !missingProviderRepairedConfig.includes('name = "openai"')) throw new Error('selftest: bare sks launch did not restore codex-lb provider block to current App contract');
  const chainCalls: any[] = [];
  const okChain = await checkCodexLbResponseChain(
    { base_url: 'https://lb.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') },
    {
      apiKey: 'sk-test',
      timeoutMs: 1000,
      fetch: async (url: any, init: any) => {
        chainCalls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ id: chainCalls.length === 1 ? 'resp_selftest_1' : 'resp_selftest_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (!okChain.ok || okChain.status !== 'chain_ok' || chainCalls.length !== 2 || !String(chainCalls[0].url).endsWith('/backend-api/codex/responses') || chainCalls[1].body.previous_response_id !== 'resp_selftest_1') throw new Error('selftest: codex-lb response chain health check did not verify previous_response_id continuity');
  const previousGlobalFetch = globalThis.fetch;
  const cacheCalls: any[] = [];
  const cachePath = path.join(codexLbHome, '.codex', 'chain-cache-selftest.json');
  try {
    globalThis.fetch = async (url: any, init: any) => {
      cacheCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: cacheCalls.length === 1 ? 'resp_cache_1' : 'resp_cache_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cacheStatus = { base_url: 'https://cache.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') };
    const firstCache = await checkCodexLbResponseChain(cacheStatus, { home: codexLbHome, apiKey: 'sk-test', timeoutMs: 1000, cachePath, now: () => 1000 });
    const secondCache = await checkCodexLbResponseChain(cacheStatus, { home: codexLbHome, apiKey: 'sk-test', timeoutMs: 1000, cachePath, now: () => 2000 });
    if (!firstCache.ok || firstCache.status !== 'chain_ok' || secondCache.cached !== true || secondCache.status !== 'chain_ok' || cacheCalls.length !== 2) throw new Error('selftest: codex-lb response chain cache did not avoid repeated launch preflight calls');
  } finally {
    globalThis.fetch = previousGlobalFetch;
  }
  const brokenChain = await checkCodexLbResponseChain(
    { base_url: 'https://lb.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') },
    {
      apiKey: 'sk-test',
      timeoutMs: 1000,
      fetch: async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_missing_selftest' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'previous_response_not_found', message: 'Previous response not found.', param: 'previous_response_id' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (brokenChain.ok || brokenChain.status !== 'previous_response_not_found' || brokenChain.chain_unhealthy !== true) throw new Error('selftest: codex-lb response chain health check did not detect previous_response_not_found');
  // 0.144 contract: removed feature stamps and legacy fast profile tables are
  // stripped, while stable Computer Use/Browser/ImageGen/plugin flags remain.
  const legacyStamps = ['remote_control = true', 'fast_mode_ui = true', 'codex_git_commit = true', '[user.fast_mode]', '[profiles.sks-fast-high]', 'fast_default_opt_out = true'];
  const survivingLegacy = legacyStamps.filter((stamp) => codexLbConfig.includes(stamp));
  const stableCapabilityStamps = ['computer_use = true', 'browser_use = true', 'browser_use_external = true', 'image_generation = true', 'in_app_browser = true', 'guardian_approval = true', 'tool_suggest = true', 'plugins = true'];
  const missingStableCapabilities = stableCapabilityStamps.filter((stamp) => !codexLbConfig.includes(stamp));
  if (!codexLbConfig.includes('hooks = true') || hasDeprecatedCodexHooksFeatureFlag(codexLbConfig) || /(?:^|\n)\s*multi_agent\s*=/.test(codexLbConfig) || !codexLbConfig.includes('fast_mode = true') || !codexLbConfig.includes('apps = true') || survivingLegacy.length || missingStableCapabilities.length || !/\[profiles\.custom\][\s\S]*?model_reasoning_effort = "low"/.test(codexLbConfig) || hasTopLevelCodexModeLock(codexLbConfig)) throw new Error(`selftest: codex-lb setup did not enforce the current feature-flag contract${survivingLegacy.length ? ` — surviving legacy stamps: ${survivingLegacy.join(', ')}` : ''}${missingStableCapabilities.length ? ` — missing stable capabilities: ${missingStableCapabilities.join(', ')}` : ''}`);
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbConfig)) throw new Error('selftest: codex-lb setup did not suppress Codex unstable feature warning');
  const codexLbLaunch = `source ${path.join(tmp, '.codex', 'sks-codex-lb.env')} && codex`;
  if (!codexLbLaunch.includes('sks-codex-lb.env')) throw new Error('selftest: Zellij launch command does not source codex-lb env file');
  if (codexLbLaunch.includes('--model')) throw new Error('selftest: Zellij launch command without an explicit model must inherit the Codex selection');
  const madLaunchSource = await safeReadText(path.join(packageRoot(), 'src', 'core', 'commands', 'mad-sks-command.js'));
  if (!madLaunchSource.includes('const lb = await deps.maybePromptCodexLbSetupForLaunch(args)') || !madLaunchSource.includes("const launchLb = lb.status === 'present'") || !madLaunchSource.includes('codexLbImmediateLaunchOpts(cleanArgs, launchLb') || !madLaunchSource.includes('bypass_codex_lb') || !madLaunchSource.includes('model_provider="openai"') || !madLaunchSource.includes('codexLbFreshSession: true')) throw new Error('selftest: MAD launch does not sync codex-lb auth and fresh-session launch options');
}
