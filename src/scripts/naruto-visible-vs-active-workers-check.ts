#!/usr/bin/env node
// @ts-nocheck
import { decideNarutoConcurrency } from '../core/naruto/naruto-concurrency-governor.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const decision = decideNarutoConcurrency({ requestedClones: 32, totalWorkItems: 64, backend: 'fake', zellijVisiblePaneCap: 8, parallelismMode: 'extreme' })
assertGate(decision.safe_active_workers >= decision.safe_zellij_visible_panes && decision.headless_workers === decision.safe_active_workers - decision.safe_zellij_visible_panes, 'active workers must be separate from visible panes', decision)
const src = readText('src/core/commands/naruto-command.ts')
assertGate(src.includes('target active workers') && src.includes('visible panes') && src.includes('headless workers'), 'Naruto UX must print active/visible/headless counts')
emitGate('naruto:visible-vs-active-workers', decision)
