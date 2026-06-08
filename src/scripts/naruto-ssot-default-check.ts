#!/usr/bin/env node
import { assertGate, emitGate, importDist, readText } from './sks-1-18-gate-lib.js'

const routes = await importDist('core/routes.js')
const ordinaryWork = routes.routePrompt('implement the missing release gate behavior')
const routeSource = readText('src/core/routes.ts')

assertGate(ordinaryWork?.id === 'Naruto', 'ordinary implementation work must default to Naruto')
assertGate(routeSource.includes('hidden: true') && routeSource.includes("aliasTo: '$Naruto'"), 'Team route must be hidden deprecated alias')
emitGate('naruto:ssot-default', { ordinary_work_route: ordinaryWork?.id })
