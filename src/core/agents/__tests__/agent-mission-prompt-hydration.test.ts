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
