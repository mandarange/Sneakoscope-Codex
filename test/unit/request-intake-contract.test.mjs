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

test('prepareRoute writes request-intake artifact and attaches it to the pipeline plan', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-request-intake-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
  await fsp.writeFile(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), JSON.stringify(wikiContext, null, 2));

  const result = await prepareRoute(root, `$Goal ${vaguePrompt}`, {});
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
