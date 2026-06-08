#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const routes = await importDist('core/routes.js')
const explicitTeam = routes.routePrompt('$Team fix a release bug')
const explicitNaruto = routes.routePrompt('$Naruto fix a release bug')

assertGate(explicitTeam?.id === 'Naruto', '$Team prompt must normalize to Naruto')
assertGate(explicitNaruto?.id === 'Naruto', '$Naruto prompt must resolve to Naruto')
emitGate('naruto:ssot-route-normalization', { team: explicitTeam?.id, naruto: explicitNaruto?.id })
