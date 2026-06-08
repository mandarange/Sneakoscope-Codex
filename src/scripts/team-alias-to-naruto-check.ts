#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const team = readText('src/core/commands/team-command.ts')
assertGate(team.includes('redirectTeamCreateToNaruto') && team.includes('team-alias-to-naruto.json'), 'sks team create path must redirect to Naruto and write proof artifact')
assertGate(team.includes('narutoCommand'), 'team command must call Naruto command')
emitGate('team:alias-to-naruto', { command: 'sks team', redirects_to: 'sks naruto run' })
