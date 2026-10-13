import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveAgentMissionPrompt } from '../agent-orchestrator.js'

test('mission-scoped agent run hydrates the transformed request instead of a generic prompt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-prompt-hydration-'))
  const missionId = 'M-hydrate'
  const dir = path.join(root, '.sneakoscope', 'missions', missionId)
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ id: missionId, prompt: 'original user task' }))
    await fs.writeFile(path.join(dir, 'request-intake.json'), JSON.stringify({ transformed_prompt: 'complete transformed execution task' }))

    assert.equal(await resolveAgentMissionPrompt(root, { missionId, prompt: 'Native agent run', promptExplicit: false }), 'complete transformed execution task')
    assert.equal(await resolveAgentMissionPrompt(root, { missionId, prompt: 'explicit override', promptExplicit: true }), 'explicit override')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('persisted prompt hydration skips empty and non-text fields in source order', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-prompt-hydration-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const missionId = 'M-invalid-fields'
  const dir = path.join(root, '.sneakoscope', 'missions', missionId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ prompt: 'original task' }))
  for (const value of [' \n\t ', {}, ['wrong task'], 42, true, null]) {
    await fs.writeFile(path.join(dir, 'request-intake.json'), JSON.stringify({ transformed_prompt: value }))
    await fs.writeFile(path.join(dir, 'route-context.json'), JSON.stringify({
      transformed_prompt: value, task: value, prompt: '  route task\nwith details  '
    }))
    assert.equal(await resolveAgentMissionPrompt(root, { missionId }), 'route task\nwith details')
    await fs.writeFile(path.join(dir, 'route-context.json'), JSON.stringify({ prompt: value }))
    assert.equal(await resolveAgentMissionPrompt(root, { missionId }), 'original task')
  }
  await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ prompt: {} }))
  assert.equal(await resolveAgentMissionPrompt(root, { missionId }), 'Native agent run')
})

test('persisted prompt hydration preserves precedence and explicit override semantics', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-prompt-hydration-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const missionId = 'M-precedence'
  const dir = path.join(root, '.sneakoscope', 'missions', missionId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'request-intake.json'), JSON.stringify({ transformed_prompt: ' intake task ' }))
  await fs.writeFile(path.join(dir, 'route-context.json'), JSON.stringify({ transformed_prompt: 'route transformed', task: 'route task', prompt: 'route prompt' }))
  await fs.writeFile(path.join(dir, 'mission.json'), JSON.stringify({ prompt: 'mission task' }))
  assert.equal(await resolveAgentMissionPrompt(root, { missionId }), 'intake task')
  assert.equal(await resolveAgentMissionPrompt(root, { missionId, prompt: 'direct task' }), 'direct task')
  assert.equal(await resolveAgentMissionPrompt(root, { missionId, promptExplicit: true }), 'Native agent run')
  await fs.rm(path.join(dir, 'request-intake.json'))
  assert.equal(await resolveAgentMissionPrompt(root, { missionId }), 'route transformed')
})
