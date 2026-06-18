import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlm52Request } from '../glm-52-request.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';

test('buildGlm52Request locks GLM 5.2 and disables fallback', () => {
  const request = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    stream: false
  });
  assert.equal(request.model, GLM_52_OPENROUTER_MODEL);
  assert.equal('models' in request, false);
  assert.equal(request.provider?.allow_fallbacks, false);
  assert.equal(request.provider?.require_parameters, true);
  assert.equal(request.provider?.sort, 'throughput');
  assert.equal(request.temperature, 0.2);
  assert.equal(request.top_p, 0.85);
  assert.deepEqual(request.reasoning, { effort: 'xhigh', exclude: true });
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(request.tool_choice, 'none');
  assert.equal(request.max_tokens, 4096);
});

test('buildGlm52Request supports xhigh without exceeding top provider cap', () => {
  const request = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    reasoningEffort: 'xhigh',
    maxTokens: 999999
  });
  assert.deepEqual(request.reasoning, { effort: 'xhigh', exclude: true });
  assert.equal(request.max_tokens, 262144);
});

test('buildGlm52Request supports deep and strict opt-in profiles', () => {
  const deep = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    args: ['--deep']
  });
  assert.equal(deep.max_tokens, 16384);
  assert.deepEqual(deep.reasoning, { effort: 'high', exclude: true });
  assert.equal(deep.tool_choice, 'auto');
  assert.equal(deep.provider?.require_parameters, true);

  const strict = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    args: ['--strict']
  });
  assert.equal(strict.provider?.require_parameters, true);
  assert.equal((strict.response_format as any)?.type, 'json_schema');
});

test('buildGlm52Request blocks invalid exact provider slugs', () => {
  assert.throws(() => buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    args: ['--exact-provider', '../bad']
  }), /invalid_openrouter_provider_slug/);
});

test('buildGlm52Request accepts documented exact provider endpoint slugs', () => {
  const request = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    args: ['--exact-provider', 'google-vertex/us-east5']
  });
  assert.deepEqual(request.provider?.order, ['google-vertex/us-east5']);
});
