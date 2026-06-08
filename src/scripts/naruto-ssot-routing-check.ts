#!/usr/bin/env node
import { assertGate, emitGate, importDist, readText } from './sks-1-18-gate-lib.js'

const routes = await importDist('core/routes.js')
const explicitTeam = routes.routePrompt('$Team fix the release gate')
const ordinaryWork = routes.routePrompt('implement a fix for the release gate')
const explicitNaruto = routes.routePrompt('$Naruto run release audit')
assertGate(explicitTeam?.id === 'Naruto', '$Team must normalize to Naruto for new work', explicitTeam)
assertGate(ordinaryWork?.id === 'Naruto', 'ordinary implementation work must default to Naruto', ordinaryWork)
assertGate(explicitNaruto?.id === 'Naruto', '$Naruto must route to Naruto', explicitNaruto)
const routeSource = readText('src/core/routes.ts')
assertGate(routeSource.includes('hidden: true') && routeSource.includes("aliasTo: '$Naruto'"), 'Team route must be hidden deprecated alias')
emitGate('naruto:ssot-routing', { team_alias: explicitTeam.id, ordinary: ordinaryWork.id })
