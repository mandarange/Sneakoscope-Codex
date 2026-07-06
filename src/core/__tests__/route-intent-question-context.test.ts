import test from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt } from '../routes.js';

const cases = [
  { prompt: '이거 왜 안 고쳐져? 로그인 버그 수정해줘', expectedRoute: 'Naruto', reason: 'direct_work' },
  { prompt: 'Can you fix the login bug?', expectedRoute: 'Naruto', reason: 'direct_work' },
  { prompt: '왜 모든 물음표를 answer로 보내? 이 라우팅 고쳐줘', expectedRoute: 'Naruto', reason: 'question_shaped_directive' },
  { prompt: 'How do I fix a typo in README?', expectedRoute: 'Answer', reason: 'answer_only' },
  { prompt: '이 함수가 왜 이렇게 동작해?', expectedRoute: 'Answer', reason: 'answer_only' },
  { prompt: '이거 가능한지 확인하고 문제 있으면 고쳐줘', expectedRoute: 'Naruto', reason: 'conditional_work' },
  { prompt: 'Could you update package version and prepare release?', expectedRoute: 'Naruto', reason: 'direct_work' },
  { prompt: '이 문구 오타만 고쳐줄 수 있어?', expectedRoute: 'DFix', reason: 'tiny_direct_fix' },
] as const;

test('question-shaped prompts route by intent instead of question mark shape', () => {
  for (const row of cases) {
    const route = routePrompt(row.prompt);
    assert.equal(route?.id, row.expectedRoute, row.prompt);
    assert.ok(
      Array.isArray(route?.intent_scores?.reasons) && route.intent_scores.reasons.includes(row.reason),
      `${row.prompt} should expose route reason ${row.reason}`
    );
  }
});
