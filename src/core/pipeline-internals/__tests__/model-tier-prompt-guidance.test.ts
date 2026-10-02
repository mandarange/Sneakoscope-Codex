import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dfixQuickContext, promptPipelineContext } from '../runtime-core.js';
import { resetVerificationProfileCache } from '../../verification-profile.js';

const route = { id: 'Naruto', command: '$sks-naruto', route: 'official subagents', explicit_invocation: false, task_profile: 'bounded-work' };

test('Tier guidance respects project verification profile and bounded delegation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tier-prompt-'));
  const previous = process.env.SKS_VERIFICATION_PROFILE;
  delete process.env.SKS_VERIFICATION_PROFILE;
  try {
    await fs.mkdir(path.join(root, '.sneakoscope'));
    const profile = path.join(root, '.sneakoscope/verification-profile.json');
    await fs.writeFile(profile, JSON.stringify({ profile: 'essential' }));
    resetVerificationProfileCache();
    // Naruto the user asked for (explicit route): implicit implementation is parent-owned and carries none of this text.
    const essential = promptPipelineContext('implement a parser correction', { ...route, explicit_invocation: true }, root);
    const implicit = promptPipelineContext('implement a parser correction', route, root);
    assert.doesNotMatch(implicit, /Codex subagent workflow: required|Naruto route: prepare subagent-plan/);
    assert.match(implicit, /Subagent policy: not required/);
    assert.match(essential, /Honor authorization already given/);
    assert.match(essential, /when a claim needs project memory/);
    assert.doesNotMatch(essential, /before each stage|read the bounded current context pack/);
    // Implementation on the Naruto route is parent orchestration, and the model
    // text must not override Jev seals or stored role preferences.
    assert.match(essential, /Codex subagent workflow: required\. The parent orchestrates only/);
    assert.match(essential, /Every child runs the newest model of the tier its work needs/);
    assert.match(essential, /When Jev mode is on, Jev picks each spawn's tier and SKS seals it/);
    // Packaged guidance names tiers, never a model.
    assert.doesNotMatch(essential, /gpt[- ]?\d/i);
    assert.match(essential, /A stored user role-model preference wins in both modes/);
    assert.doesNotMatch(essential, /regardless of parent model or saved role preferences|explicit Naruto or parallel task/);
    assert.match(essential, /Naruto route: prepare subagent-plan/);
    assert.doesNotMatch(essential, /Post-route reflection:|then run SKS Honest Mode/);
    const audit = promptPipelineContext('audit all packages', { id: 'SKS', command: '$SKS', route: 'general', task_profile: 'bounded-work' }, root);
    assert.match(audit, /Subagent policy: not required/);
    assert.match(dfixQuickContext('Translate to English', { id: 'DFix' }, root), /Return the requested content directly/);
    assert.doesNotMatch(dfixQuickContext('Translate to English', { id: 'DFix' }, root), /DFix 완료 요약/);

    const parallel = promptPipelineContext('implement two independent slices in parallel', { ...route, explicit_invocation: true }, root);
    assert.match(parallel, /Naruto route: prepare subagent-plan/);
    await fs.writeFile(profile, JSON.stringify({ profile: 'strict' }));
    resetVerificationProfileCache();
    const strict = promptPipelineContext('implement a parser correction', { ...route, explicit_invocation: true }, root);
    assert.match(strict, /then run SKS Honest Mode/);
    assert.match(strict, /Post-route reflection:/);
  } finally {
    if (previous === undefined) delete process.env.SKS_VERIFICATION_PROFILE;
    else process.env.SKS_VERIFICATION_PROFILE = previous;
    resetVerificationProfileCache();
    await fs.rm(root, { recursive: true, force: true });
  }
});
