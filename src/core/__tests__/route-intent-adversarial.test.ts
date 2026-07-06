import test from 'node:test'
import assert from 'node:assert/strict'
import { routePrompt } from '../routes.js'

const cases = [
  { prompt: 'Can you fix the failing tests?', expected: ['Naruto'] },
  { prompt: '고쳐줄 수 있어? 로그인 테스트 깨져', expected: ['Naruto'] },
  { prompt: '이거 왜 안 고쳐져? 수정해줘', expected: ['Naruto'] },
  { prompt: 'How do I fix this myself?', expected: ['Answer'] },
  { prompt: '이 함수 왜 이렇게 동작해? 설명만 해줘', expected: ['Answer'] },
  { prompt: 'README 오타만 고쳐줄래?', expected: ['DFix'] },
  { prompt: '$Super-Search run "npm release notes"', expected: ['SuperSearch'] },
  { prompt: 'site:x.com product launch 찾아줘', expected: ['SuperSearch'] },
  { prompt: 'Supabase RLS 수정해줘', expected: ['DB', 'MadSKS'] },
  { prompt: '커밋하고 푸시해줘', expected: ['CommitAndPush'] }
] as const

test('adversarial route-intent matrix stays stable', () => {
  for (const row of cases) {
    const route = routePrompt(row.prompt)
    assert.ok(route, `missing route for ${row.prompt}`)
    assert.ok(row.expected.some((expected) => expected === route.id), `${row.prompt} routed to ${route.id}, expected ${row.expected.join(' or ')}`)
  }
})
