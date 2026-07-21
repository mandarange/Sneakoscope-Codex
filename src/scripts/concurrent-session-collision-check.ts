#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { evaluateHookPayload } from '../core/hooks-runtime.js'
import { installGlobalSkills } from '../core/init/skills.js'
import { loadStateForSession, listSessionStates, stateFile } from '../core/mission.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-concurrent-session-'))
const fixtureHome = path.join(root, '.fixture-home')
process.env.HOME = fixtureHome
process.env.CODEX_HOME = path.join(fixtureHome, '.codex')
process.env.SKS_GLOBAL_ROOT = path.join(fixtureHome, '.sneakoscope-global')
await fs.mkdir(fixtureHome, { recursive: true })
const skillInstall = await installGlobalSkills(fixtureHome)
if (!skillInstall.ok) throw new Error('concurrent_session_skill_install_failed')
await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true })

const aPrompt = await evaluateHookPayload('user-prompt-submit', {
  cwd: root,
  conversation_id: 'chat-a',
  prompt: '$Naruto concurrent session A fixture'
}, { root })
const aState = await loadStateForSession(root, 'chat-a')

const bPrompt = await evaluateHookPayload('user-prompt-submit', {
  cwd: root,
  conversation_id: 'chat-b',
  prompt: '$QA-LOOP concurrent session B fixture'
}, { root })
const bState = await loadStateForSession(root, 'chat-b')

const aReload = await loadStateForSession(root, 'chat-a')
const stopA = await evaluateHookPayload('stop', {
  cwd: root,
  conversation_id: 'chat-a',
  last_assistant_message: 'Done.'
}, { root })
const aAfterStop = await loadStateForSession(root, 'chat-a')

await evaluateHookPayload('user-prompt-submit', {
  cwd: root,
  prompt: '$DFix fallback warning fixture A'
}, { root })
await evaluateHookPayload('stop', {
  cwd: root,
  last_assistant_message: 'DFix 완료 요약: fallback warning fixture.\nDFix 솔직모드: verified: warning path checked; not verified: none; remaining: none.'
}, { root })

const sessions = await listSessionStates(root)
const legacy = JSON.parse(await fs.readFile(stateFile(root), 'utf8'))
const warningPath = path.join(root, '.sneakoscope', 'state', 'session-id-fallback-warning.jsonl')
const warningLines = (await fs.readFile(warningPath, 'utf8').catch(() => '')).trim().split(/\n/).filter(Boolean)

const blockers = [
  ...(aState.mission_id ? [] : ['session_a_mission_missing']),
  ...(bState.mission_id ? [] : ['session_b_mission_missing']),
  ...(aState.mission_id && bState.mission_id && aState.mission_id !== bState.mission_id ? [] : ['session_missions_not_distinct']),
  ...(aReload.mission_id === aState.mission_id ? [] : ['session_a_reloaded_as_other_mission']),
  ...(aAfterStop.mission_id === aState.mission_id ? [] : ['session_a_stop_state_contaminated']),
  ...(legacy._session_key ? [] : ['legacy_current_missing_session_key']),
  ...(sessions.length >= 2 ? [] : ['session_state_table_missing_rows']),
  ...(warningLines.length >= 2 ? [] : ['missing_explicit_session_warning_log']),
  ...(String(stopA?.reason || stopA?.systemMessage || '').includes(bState.mission_id || 'never-match') ? ['stop_a_mentions_session_b_mission'] : [])
]

const report = {
  schema: 'sks.concurrent-session-collision-check.v1',
  ok: blockers.length === 0,
  a_prompt_continue: aPrompt?.continue === true,
  b_prompt_continue: bPrompt?.continue === true,
  session_a: { mission_id: aState.mission_id, phase: aState.phase, key: aState._session_key },
  session_b: { mission_id: bState.mission_id, phase: bState.phase, key: bState._session_key },
  legacy_current: { mission_id: legacy.mission_id, session_key: legacy._session_key },
  sessions: sessions.map((row) => ({ session_key: row.session_key, mission_id: row.mission_id, phase: row.phase })),
  fallback_warning_count: warningLines.length,
  stop_a_decision: stopA?.decision || (stopA?.continue ? 'continue' : 'unknown'),
  blockers
}

console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1
