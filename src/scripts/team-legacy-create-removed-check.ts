#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/commands/team-command.ts')
const body = src.slice(src.indexOf('export async function team'), src.indexOf('async function redirectTeamCreateToNaruto'))
const forbidden = ['native_agent_intake', 'development_team', 'review_team', 'runNativeAgentOrchestrator', 'buildTeamPlan', 'parseTeamCreateArgs']
assertGate(body.includes('redirectTeamCreateToNaruto') && !body.includes('runNativeAgentOrchestrator') && !body.includes('jsonOutput'), 'Team create legacy code must not remain in team() body')
assertGate(forbidden.every((token) => !src.includes(token)), 'Team create legacy planning/runtime tokens must not remain in team-command.ts', { forbidden, present: forbidden.filter((token) => src.includes(token)) })
assertGate(readText('src/core/commands/team-legacy-observe-command.ts').includes('teamLegacyObserveCommand'), 'legacy observe/watch commands must be isolated in team-legacy-observe-command.ts')
assertGate(readText('src/cli/command-registry.ts').includes('Deprecated alias. New execution redirects to Naruto; legacy observe/watch remains.'), 'Team registry description must describe deprecated alias behavior')
emitGate('team:legacy-create-removed', { isolated: true })
