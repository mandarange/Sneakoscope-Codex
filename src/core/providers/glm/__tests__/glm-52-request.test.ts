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
  assert.equal(request.temperature, 1);
  assert.equal(request.top_p, 0.95);
  assert.deepEqual(request.reasoning, { effort: 'high' });
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(request.tool_choice, 'auto');
});

test('buildGlm52Request supports xhigh without exceeding top provider cap', () => {
  const request = buildGlm52Request({
    messages: [{ role: 'user', content: 'hello' }],
    reasoningEffort: 'xhigh',
    maxTokens: 999999
  });
  assert.deepEqual(request.reasoning, { effort: 'xhigh' });
  assert.equal(request.max_tokens, 262144);
});
