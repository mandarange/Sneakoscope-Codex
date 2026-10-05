import '../../core/__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { narutoDecisionForRoute, routeById, routePrompt, routeRequiresSubagents } from '../routes.js'
import { classifyTaskProfile } from '../runtime/task-profile.js'

const decide = (prompt: string) => {
  const route = routePrompt(prompt)
  return { route: route?.id as string | undefined, ...narutoDecisionForRoute(route, prompt, classifyTaskProfile(prompt)) }
}

test('ordinary implementation work runs directly in the parent, however it is worded or how risky its nouns are', () => {
  for (const prompt of [
    'Fix the null check in parseConfig',
    'Add a unit test for the date formatter',
    'login 버그 고쳐줘',
    'refactor utils.ts to remove the duplicate helper',
    'make the header sticky',
    '이 함수에 로깅 추가해줘',
    // High-risk nouns raise the gate profile, they do not ask for child agents.
    'update the deploy script to use node 22',
    'fix the auth redirect bug',
    // A specialized pipeline chosen from wording does not fan out by itself.
    'Optimize the SQL query in reports.ts',
    // Words like parallel, naruto, subagents, or fan out as subject matter are not a request.
    'fix the flaky parallel test runner',
    'refactor the naruto decision gate to be simpler',
    'add a subagents section to the README docs',
    'rename the fan out helper',
    '병렬 테스트 러너의 버그 고쳐줘',
    '나루토 결정 게이트를 단순화해줘'
  ]) {
    const decision = decide(prompt)
    assert.equal(decision.required, false, `${prompt} -> ${decision.route}/${decision.reason}`)
    assert.notEqual(decision.route, 'Naruto', prompt)
    assert.equal(routeRequiresSubagents(routePrompt(prompt), prompt), false, prompt)
  }
})

test('child agents run when the user asks for them', () => {
  for (const [prompt, reason] of [
    ['implement the settings page and the API in parallel', /^explicit_parallel_request/],
    ['서브에이전트로 나눠서 이 모듈들 정리해줘', /^explicit_parallel_request/],
    // A risk word in the prompt does not cancel an explicit request for parallel work.
    ['로그인 버그와 결제 버그를 서브에이전트로 나눠서 수정해줘', /^explicit_parallel_request:high-risk$/],
    ['fix the auth and the payment bugs in parallel', /^explicit_parallel_request:high-risk$/],
    ['$sks-naruto fix the importer', /^explicit_official_subagent_route$/],
    ['$work fix the importer', /^explicit_official_subagent_route$/],
    ['fix the importer --agents 4', /^explicit_subagent_count$/],
    ['use 3 subagents to migrate the importers', /^explicit_parallel_request/],
    ['split the refactor across agents', /^explicit_parallel_request/],
    ['이 작업들 병렬로 진행해줘', /^explicit_parallel_request/]
  ] as const) {
    const decision = decide(prompt)
    assert.equal(decision.required, true, prompt)
    assert.match(decision.reason, reason, prompt)
  }
})

test('an artifact pipeline the user named keeps its panel, the same route picked from wording does not', () => {
  const named = narutoDecisionForRoute({ ...routeById('PPT'), explicit_invocation: true }, 'build the investor deck', 'bounded-work')
  assert.equal(named.required, true)
  assert.match(named.reason, /^specialized_route_default_parallel:/)
  const implicit = narutoDecisionForRoute({ ...routeById('PPT'), explicit_invocation: false }, 'build the investor deck', 'bounded-work')
  assert.equal(implicit.required, false)
  assert.match(implicit.reason, /^specialized_route_parent_owned:/)
})

test('review, DB, and MAD-SKS stay single-agent even when named explicitly', () => {
  for (const id of ['Review', 'DB', 'MadSKS']) {
    const named = narutoDecisionForRoute({ ...routeById(id), explicit_invocation: true }, 'review the migration', 'bounded-work')
    assert.equal(named.required, false, id)
    assert.notEqual(named.mode, 'generic_naruto', id)
  }
})

test('a routed-to-Naruto prompt that is not delegated gets the lightest parent-owned route and no orchestration text', () => {
  const route = routePrompt('Fix the null check in parseConfig')
  assert.equal(route?.id, 'SKS')
  assert.equal(route?.explicit_invocation, false)
  assert.ok(Array.isArray(route?.requiredSkills))
  assert.equal(route.requiredSkills.includes('naruto'), false)
})
