import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseResearchCommandArgs, readStrictResearchIntegerFlag, resolveResearchRunMissionId } from '../research-command.js'

test('Research command parser is strict, supports equals values, and rejects option-only topics', () => {
  assert.deepEqual(parseResearchCommandArgs('prepare', ['bounded', 'topic', '--depth=frontier', '--json']), {
    args: ['bounded', 'topic', '--depth', 'frontier', '--json'],
    positionals: ['bounded', 'topic']
  })
  assert.deepEqual(parseResearchCommandArgs('run', ['--max-threads=3', 'latest', '--agents', '3']), {
    args: ['--max-threads', '3', 'latest', '--agents', '3'],
    positionals: ['latest']
  })
  assert.throws(() => parseResearchCommandArgs('prepare', ['--depth=frontier']), /Missing research topic/)
  assert.throws(() => parseResearchCommandArgs('run', ['--max-threads=3']), /Missing Research mission id/)
  assert.throws(() => parseResearchCommandArgs('status', ['latest', '--refresh']), /Unsupported Research option: --refresh/)
  assert.throws(() => parseResearchCommandArgs('run', ['latest', '--unknown']), /Unsupported Research option: --unknown/)
  assert.throws(() => parseResearchCommandArgs('run', ['latest', '--json=true']), /does not accept a value/)
})

test('Research command parser fails closed on every legacy runtime selector family', () => {
  for (const option of [
    '--backend', '--backend-mode', '--provider', '--scheduler', '--scheduler-mode',
    '--pool', '--pool-size', '--model', '--parent-model', '--worker-model', '--concurrency'
  ]) {
    assert.throws(() => parseResearchCommandArgs('run', ['latest', `${option}=legacy`]), /Unsupported legacy Research runtime option/, option)
    assert.throws(() => parseResearchCommandArgs('run', ['latest', option, 'legacy']), /Unsupported legacy Research runtime option/, option)
  }
})

test('Research integer flags accept split and equals forms but reject ambiguous values', () => {
  assert.equal(readStrictResearchIntegerFlag(['--max-threads', '1'], '--max-threads', 3, 1, 3), 1)
  assert.equal(readStrictResearchIntegerFlag(['--max-threads=1'], '--max-threads', 3, 1, 3), 1)
  assert.equal(readStrictResearchIntegerFlag(['--agents=3'], '--agents', 3, 3, 3), 3)
  assert.throws(() => readStrictResearchIntegerFlag(['--agents=5'], '--agents', 3, 3, 3), /Out-of-range/)
  assert.throws(() => readStrictResearchIntegerFlag(['--max-threads'], '--max-threads', 3, 1, 3), /Missing value/)
  assert.throws(() => readStrictResearchIntegerFlag(['--max-threads='], '--max-threads', 3, 1, 3), /Invalid value/)
  assert.throws(() => readStrictResearchIntegerFlag(['--max-threads=fast'], '--max-threads', 3, 1, 3), /Invalid value/)
  assert.throws(() => readStrictResearchIntegerFlag(['--max-threads=0'], '--max-threads', 3, 1, 3), /Out-of-range/)
  assert.throws(() => readStrictResearchIntegerFlag(['--max-threads=1', '--max-threads', '2'], '--max-threads', 3, 1, 3), /Duplicate/)
})

test('Research latest binds to the active Research mission instead of the global newest mission', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-active-latest-'))
  const activeMission = 'M-20260713-000000-aaaa'
  await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true })
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', activeMission), { recursive: true })
  await fsp.writeFile(path.join(root, '.sneakoscope', 'missions', activeMission, 'mission.json'), JSON.stringify({ id: activeMission, mode: 'research', created_at: '2026-07-13T00:00:00.000Z' }))
  await fsp.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), JSON.stringify({
    mission_id: activeMission,
    route: 'Research',
    mode: 'RESEARCH',
    phase: 'RESEARCH_PREPARED'
  }))
  assert.equal(await resolveResearchRunMissionId(root, 'latest'), activeMission)
  assert.equal(await resolveResearchRunMissionId(root, 'M-explicit'), 'M-explicit')
})

test('Research latest ignores non-Research state and resolves only Research missions', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-filtered-latest-'))
  const missionsDir = path.join(root, '.sneakoscope', 'missions')
  const researchMission = 'M-20260713-000000-research'
  const newerNarutoMission = 'M-20260713-010000-naruto'
  await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true })
  await fsp.mkdir(path.join(missionsDir, researchMission), { recursive: true })
  await fsp.mkdir(path.join(missionsDir, newerNarutoMission), { recursive: true })
  await fsp.writeFile(path.join(missionsDir, researchMission, 'mission.json'), JSON.stringify({ id: researchMission, mode: 'research', created_at: '2026-07-13T00:00:00.000Z' }))
  await fsp.writeFile(path.join(missionsDir, newerNarutoMission, 'mission.json'), JSON.stringify({ id: newerNarutoMission, mode: 'naruto', created_at: '2026-07-13T01:00:00.000Z' }))
  await fsp.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), JSON.stringify({
    mission_id: newerNarutoMission,
    route: 'Research',
    mode: 'RESEARCH',
    phase: 'RESEARCH_PREPARED'
  }))
  assert.equal(await resolveResearchRunMissionId(root, 'latest'), researchMission)

  await fsp.rm(path.join(missionsDir, researchMission), { recursive: true, force: true })
  assert.equal(await resolveResearchRunMissionId(root, 'latest'), null)
})
