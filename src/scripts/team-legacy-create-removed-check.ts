#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/commands/team-command.ts')
const body = src.slice(src.indexOf('export async function team'), src.indexOf('async function redirectTeamCreateToNaruto'))
assertGate(body.includes('redirectTeamCreateToNaruto') && !body.includes('runNativeAgentOrchestrator') && !body.includes('jsonOutput'), 'Team create legacy code must not remain in team() body')
assertGate(readText('src/cli/command-registry.ts').includes('Deprecated Team alias; create redirects to Naruto'), 'Team registry description must describe deprecated alias behavior')
emitGate('team:legacy-create-removed')
