import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRequestIntake } from '../../dist/core/questions.js';
import { prepareRoute, routePrompt, writePipelinePlan } from '../../dist/core/pipeline.js';
import { sealContract } from '../../dist/core/decision-contract.js';

const wikiContext = {
  schema: 'sks.wiki-coordinate.v1',
  attention: {
    mode: 'aggressive_triwiki_active_recall',
    use_first: [['user-request-frequency-general-user-preference']],
    hydrate_first: []
  },
  claims: [
    {
      id: 'user-request-frequency-general-user-preference',
      summary: 'Repeated user preference: infer vague prompts through TriWiki and list requirements before pipeline execution.',
      source: '.sneakoscope/memory/q2_facts/user-preferences.md',
      trust_score: 0.91
    }
  ]
};

const vaguePrompt = '사람들이 모호하게 요청하니까 위키 참고해서 의도를 명확히 파악하고 요청사항을 누락 없이 리스트업한 뒤 프롬프트를 변환해서 파이프라인에 태워줘 $goal';

test('request intake turns vague prompts into wiki-informed execution prompts', () => {
  const intake = buildRequestIntake(vaguePrompt, {}, { wikiContext });
  assert.equal(intake.schema, 'sks.request-intake.v1');
  assert.match(intake.interpreted_intent.goal, /request-intake|요구사항|변환 프롬프트/);
  assert.equal(intake.wiki_context_used.source, '.sneakoscope/wiki/context-pack.json');
  assert.ok(intake.requirements.some((item) => /위키|TriWiki/.test(item.text)));
  assert.ok(intake.requirements.some((item) => /리스트|누락|요청사항/.test(item.text)));
  assert.match(intake.transformed_prompt, /# SKS Wiki-Informed Execution Prompt/);
  assert.match(intake.transformed_prompt, /## Requirements/);
  assert.match(intake.transformed_prompt, /## Pipeline Instruction/);
});

test('current-version documentation requests do not masquerade as a Sneakoscope version bump', () => {
  const docsPrompt = '나루토 모드가 병렬에 특화되지 않은 문제를 고치기 위해 Codex CLI와 Desktop app의 최신 버전 문서를 보고 수정해줘';
  const directivePrompt = '아래 내용을 모든 작업의 핵심 지침으로 만들고 영문으로 단순하고 강력하게 준수하도록 반영해줘';
  const docsIntake = buildRequestIntake(docsPrompt, {}, { wikiContext });
  const directiveIntake = buildRequestIntake(directivePrompt, {}, { wikiContext });
  const bumpIntake = buildRequestIntake('Sneakoscope 버전을 다음 patch로 올려줘', {}, { wikiContext });

  assert.doesNotMatch(docsIntake.interpreted_intent.goal, /sneakoscope 버전을 .*올린다/i);
  assert.doesNotMatch(docsIntake.interpreted_intent.goal, /우선순위 신호/);
  assert.match(docsIntake.interpreted_intent.goal, /나루토 병렬 구조|사용자 요청/);
  assert.doesNotMatch(directiveIntake.interpreted_intent.goal, /우선순위 신호/);
  assert.match(directiveIntake.interpreted_intent.goal, /핵심 지침/);
  assert.match(bumpIntake.interpreted_intent.goal, /sneakoscope 버전을 다음 patch 버전으로 올린다/i);
});

test('explicit priority-memory requests keep their literal goal and focused verification scope', () => {
  const prompt = '이 선호를 TriWiki 우선순위로 기억해줘';
  const intake = buildRequestIntake(prompt, {}, { wikiContext });

  assert.equal(intake.interpreted_intent.goal, prompt);
  assert.equal(intake.priority_signal.requested, true);
  assert.equal(intake.priority_signal.preserves_literal_goal, true);
  assert.deepEqual(intake.acceptance_criteria.length > 0, true);
  assert.doesNotMatch(intake.transformed_prompt, /packcheck|publish:dry|sizecheck/);
});

test('Naruto prepareRoute writes request-intake artifact and attaches it to the pipeline plan', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-request-intake-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
  await fsp.writeFile(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), JSON.stringify(wikiContext, null, 2));

  const narutoPrompt = `${vaguePrompt.replace(/\s*\$goal$/i, '')} 실제 코드를 수정하고 검증까지 완료해줘`;
  const result = await prepareRoute(root, `$Naruto ${narutoPrompt}`, {});
  const missionId = result.additionalContext.match(/Mission: (M-[^\n]+)/)?.[1]
    || (await fsp.readdir(path.join(root, '.sneakoscope', 'missions'))).find((name) => name.startsWith('M-'));
  assert.ok(missionId);

  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const intake = JSON.parse(await fsp.readFile(path.join(dir, 'request-intake.json'), 'utf8'));
  const plan = JSON.parse(await fsp.readFile(path.join(dir, 'pipeline-plan.json'), 'utf8'));

  assert.equal(plan.request_intake.artifact, 'request-intake.json');
  assert.equal(plan.request_intake.prompt_hash, intake.prompt_hash);
  assert.equal(plan.request_intake.transformed_prompt_available, true);
  assert.match(plan.execution_prompt, /SKS Wiki-Informed Execution Prompt/);
  assert.equal(intake.pipeline_usage.use_transformed_prompt_for_execution, true);
});

test('pipeline plan reuses contract-sealed request intake instead of rebuilding it', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-contract-intake-'));
  const missionId = 'M-contract-intake';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), JSON.stringify(wikiContext, null, 2));
  await fsp.writeFile(path.join(dir, 'required-answers.schema.json'), JSON.stringify({
    schema_version: 2,
    prompt: vaguePrompt,
    inferred_answers: {},
    slots: []
  }, null, 2));
  await fsp.writeFile(path.join(dir, 'answers.json'), JSON.stringify({ ACCEPTANCE_CRITERIA: ['contract sealed intake is reused by pipeline plan'] }, null, 2));

  const sealed = await sealContract(dir, { id: missionId, prompt: vaguePrompt, mode: 'qaloop' });
  assert.equal(sealed.ok, true);
  const contract = JSON.parse(await fsp.readFile(path.join(dir, 'decision-contract.json'), 'utf8'));
  const plan = await writePipelinePlan(dir, {
    missionId,
    route: routePrompt('$QA-LOOP'),
    task: vaguePrompt,
    ambiguity: { required: true, passed: true }
  });

  assert.equal(plan.request_intake.prompt_hash, contract.request_intake.prompt_hash);
  assert.equal(plan.execution_prompt, contract.request_intake.transformed_prompt);
});
