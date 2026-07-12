import test from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt, routeRequiresSubagents } from '../routes.js';

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

test('greetings and bounded work avoid subagents while explicit parallel work requires them', () => {
  assert.equal(routePrompt('hi'), null);
  assert.equal(routePrompt('이 함수 설명해줘')?.id, 'Answer');
  const bounded = routePrompt('로그인 버그 수정해줘');
  assert.equal(routeRequiresSubagents(bounded, '로그인 버그 수정해줘'), false);
  const parallel = routePrompt('여러 패키지를 병렬 검토해줘');
  assert.equal(parallel?.id, 'Naruto');
  assert.equal(routeRequiresSubagents(parallel, '여러 패키지를 병렬 검토해줘'), true);
  for (const prompt of ['audit all packages', 'Review all files', 'one agent per package audit']) {
    const route = routePrompt(prompt);
    assert.equal(route?.id, 'Naruto', prompt);
    assert.equal(routeRequiresSubagents(route, prompt), true, prompt);
  }
  assert.equal(routeRequiresSubagents(routePrompt('$Naruto implement one fix'), '$Naruto implement one fix'), true);
  assert.equal(routePrompt('$Work')?.id, 'Naruto');
  assert.equal(routePrompt('$Work')?.explicit_invocation, true);
  const ordinaryWork = routePrompt('work on the parser');
  assert.equal(ordinaryWork?.id, 'Naruto');
  assert.equal(ordinaryWork?.task_profile, 'bounded-work');
  assert.equal(ordinaryWork?.explicit_invocation, false);
  assert.equal(routeRequiresSubagents(ordinaryWork, 'work on the parser'), false);
});

test('implementation language and Korean fix conjugations route as work', () => {
  for (const prompt of ['UI implementation 해줘', 'UI 버그 고치고 리뷰해줘', '이 문제는 이번 버전에서 반드시 해결해야해']) {
    const route = routePrompt(prompt);
    assert.equal(route?.id, 'Naruto', prompt);
    assert.equal(route?.task_profile, 'bounded-work', prompt);
  }
  const parallel = routePrompt('parallel implementation');
  assert.equal(parallel?.id, 'Naruto');
  assert.equal(parallel?.task_profile, 'parallel-write');
  assert.equal(routeRequiresSubagents(parallel, 'parallel implementation'), true);
});
