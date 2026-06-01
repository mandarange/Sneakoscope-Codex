import test from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt, looksLikeAnswerOnlyRequest, looksLikeDirectWorkRequest } from '../../dist/core/routes.js';

test('mixed Korean complaint plus fix/release directive routes to Team, not Answer', () => {
  const prompt = '아니 codex app이랑 호환이 안되는거같은데...?? 원인 분석해서 완벽하게 다음버전으로 수정하고 배포 준비해줘 use context7 mcp';
  assert.equal(routePrompt(prompt)?.id, 'Team');
  assert.equal(looksLikeDirectWorkRequest(prompt), true);
  assert.equal(looksLikeAnswerOnlyRequest(prompt), false);
});

test('method-style fix question without execution directive stays answer-only', () => {
  const prompt = '이 오류는 어떻게 수정해야 해?';
  assert.equal(routePrompt(prompt)?.id, 'Answer');
  assert.equal(looksLikeDirectWorkRequest(prompt), false);
  assert.equal(looksLikeAnswerOnlyRequest(prompt), true);
});

test('English question-shaped bug report with explicit release work routes to Team', () => {
  const prompt = 'why is the Codex app integration broken?? analyze the cause, fix it, and prepare the next version for release';
  assert.equal(routePrompt(prompt)?.id, 'Team');
  assert.equal(looksLikeDirectWorkRequest(prompt), true);
  assert.equal(looksLikeAnswerOnlyRequest(prompt), false);
});
