import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeAgentOrchestrator } from '../../dist/core/agents/agent-orchestrator.js';
import { createCandidateCard, routeSkillId } from '../../dist/core/skills/core-skill-card.js';
import { promoteToDeployed } from '../../dist/core/skills/core-skill-deployment.js';

test('agent proof records selected_core_skill from the deployed snapshot', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-proof-skill-'));
  const route = '$Agent';
  const skillId = routeSkillId(route);
  const accepted = { ...createCandidateCard({ skillId, route, baseVersion: 0, body: 'deployed agent skill body' }), status: 'accepted' };
  const promoted = await promoteToDeployed(root, accepted);
  assert.equal(promoted.ok, true);

  const result = await runNativeAgentOrchestrator({ route, prompt: 'inspect repo', backend: 'fake', mock: true, agents: 1, concurrency: 1, root });
  assert.ok(result.proof, 'orchestrator must return proof');
  assert.ok(result.proof.selected_core_skill, 'proof must include selected_core_skill');
  assert.equal(result.proof.selected_core_skill.source, 'deployed');
  assert.equal(result.proof.selected_core_skill.skill_id, skillId);
  assert.equal(result.proof.selected_core_skill.optimizer_invoked, false);
});

test('agent proof selected_core_skill falls back gracefully when no snapshot deployed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-proof-skill-fb-'));
  const result = await runNativeAgentOrchestrator({ route: '$Agent', prompt: 'inspect repo', backend: 'fake', mock: true, agents: 1, concurrency: 1, root });
  assert.ok(result.proof.selected_core_skill, 'proof must include selected_core_skill even on fallback');
  assert.equal(result.proof.selected_core_skill.source, 'fallback');
});
