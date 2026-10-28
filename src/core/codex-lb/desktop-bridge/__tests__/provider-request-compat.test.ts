import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROVIDER_INCLUDE_ALLOWLIST,
  adaptRequestForRoute,
  logRequestAdaptation,
  providerExtraInclude,
} from '../provider-request-compat.js';
import type { DesktopBridgeRouteContext, PreparedDesktopBridgeConfig } from '../types.js';

const route = (provider_id: DesktopBridgeRouteContext['provider_id']): DesktopBridgeRouteContext => ({
  provider_id, public_model: 'gpt-x', upstream_model: 'gpt-x', catalog_generation: 'c', route_policy_generation: 'p', session_pin: null,
});
// What Codex sends any "OpenAI" provider with output-token replay on.
const replayInclude = () => ['reasoning.encrypted_content', 'output.encrypted_content'];
const codexCreate = () => ({
  model: 'gpt-x',
  input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'base instructions' }] }],
  include: replayInclude(),
  stream: true,
  stream_options: { include_obfuscation: false },
  access_programs: ['codex'],
  client_metadata: { session_id: 's' },
  prompt_cache_key: 'k',
  service_tier: 'priority',
  text: { verbosity: 'low' },
});

test('Codex-LB keeps only the include values it accepts, and every other field as sent', () => {
  const payload = codexCreate();
  const before = structuredClone(payload);
  assert.deepEqual(adaptRequestForRoute(payload, route('codex-lb')), [{ field: 'include', value: 'output.encrypted_content' }]);
  assert.deepEqual(payload.include, ['reasoning.encrypted_content']);
  const { include: _a, ...rest } = payload;
  const { include: _b, ...restBefore } = before;
  assert.deepEqual(rest, restBefore, 'stream_options, access_programs and client_metadata stay: Codex-LB accepts them');
  for (const value of PROVIDER_INCLUDE_ALLOWLIST['codex-lb']!) {
    const allowed = { include: [value] };
    assert.deepEqual(adaptRequestForRoute(allowed, route('codex-lb')), []);
    assert.deepEqual(allowed.include, [value]);
  }
});

test('OpenRouter loses the include values it refuses and keeps the fields it accepts; reasoning always survives', () => {
  // Probed live 2026-10-28: OpenRouter answers `output.encrypted_content` with 400
  // invalid_prompt, and accepts Codex's stream_options and access_programs.
  const payload = codexCreate();
  const before = structuredClone(payload);
  assert.deepEqual(adaptRequestForRoute(payload, route('openrouter')), [{ field: 'include', value: 'output.encrypted_content' }]);
  assert.deepEqual(payload.include, ['reasoning.encrypted_content']);
  const { include: _a, ...rest } = payload;
  const { include: _b, ...restBefore } = before;
  assert.deepEqual(rest, restBefore);
  for (const provider of ['codex-lb', 'openrouter'] as const) {
    assert.ok(PROVIDER_INCLUDE_ALLOWLIST[provider]!.includes('reasoning.encrypted_content'), `${provider} keeps reasoning`);
  }
});

test('the official route is never touched', () => {
  const payload = codexCreate();
  const before = structuredClone(payload);
  assert.deepEqual(adaptRequestForRoute(payload, route('openai'), ['anything']), []);
  assert.deepEqual(payload, before);
});

test('an operator extra include survives; a request without include or body is left alone', () => {
  const payload = { include: replayInclude() };
  assert.deepEqual(adaptRequestForRoute(payload, route('codex-lb'), ['output.encrypted_content']), []);
  assert.deepEqual(payload.include, replayInclude());
  const bare: Record<string, unknown> = { model: 'gpt-x', input: [] };
  assert.deepEqual(adaptRequestForRoute(bare, route('codex-lb')), []);
  assert.equal('include' in bare, false);
  assert.deepEqual(adaptRequestForRoute(null, route('codex-lb')), []);
  const odd = { include: [42, 'reasoning.encrypted_content'] };
  assert.deepEqual(adaptRequestForRoute(odd, route('codex-lb')), [{ field: 'include', value: '42' }]);
  assert.deepEqual(odd.include, ['reasoning.encrypted_content']);
});

test('providerExtraInclude reads the route provider profile and only well-formed values', () => {
  const config = {
    providers: {
      'codex-lb': { request_compat: { extra_include: ['output.encrypted_content', 'Bad Value'] } },
      openrouter: {},
    },
  } as unknown as PreparedDesktopBridgeConfig;
  assert.deepEqual(providerExtraInclude(config, route('codex-lb')), ['output.encrypted_content']);
  assert.deepEqual(providerExtraInclude(config, route('openrouter')), []);
  assert.deepEqual(providerExtraInclude(config, route('openai')), []);
});

test('the adaptation log says that it happens, with a running count, and carries no request content', () => {
  const lines: string[] = [];
  let clock = 1_000_000;
  const config = {} as PreparedDesktopBridgeConfig;
  const log = (changes: Parameters<typeof logRequestAdaptation>[2]) => logRequestAdaptation(config, route('codex-lb'), changes, 'websocket', {
    write: (line) => lines.push(line), now: () => clock,
  });
  const dropped = [{ field: 'include' as const, value: 'output.encrypted_content' }];
  log(dropped);
  for (let turn = 0; turn < 15; turn += 1) log(dropped);
  assert.equal(lines.length, 1, 'one line per (provider, field, value), not one per turn');
  clock += 61_000;
  log(dropped);
  const rows = lines.map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => [row.event, row.code, row.provider_id, row.field, row.value, row.count, row.transport]),
    [
      ['sks.desktop_bridge.request_adapted', 'bridge_request_include_dropped', 'codex-lb', 'include', 'output.encrypted_content', 1, 'websocket'],
      ['sks.desktop_bridge.request_adapted', 'bridge_request_include_dropped', 'codex-lb', 'include', 'output.encrypted_content', 17, 'websocket'],
    ],
  );
  log([{ field: 'include' as const, value: 'secret prompt text that is not an identifier' }]);
  const tail = lines.slice(2).map((line) => JSON.parse(line));
  assert.equal(tail[0].value, '<other>');
  assert.equal(lines.join('').includes('secret prompt'), false);
  // A restarted bridge (a new prepared config) starts its counts over.
  const restarted: string[] = [];
  logRequestAdaptation({} as PreparedDesktopBridgeConfig, route('codex-lb'), dropped, 'http', { write: (line) => restarted.push(line), now: () => clock });
  assert.equal(JSON.parse(restarted[0]!).count, 1);
});
