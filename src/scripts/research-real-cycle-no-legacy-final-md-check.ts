#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const source = readText('src/core/commands/research-command.ts')
const defaultIndex = source.indexOf('const cycleResult = await runResearchCycle({')
const legacyIndex = source.indexOf('const legacyResearchCycle')
const legacyExecIndex = source.indexOf('runCodexExec({')

assertGate(defaultIndex > 0, 'default research run must call runResearchCycle with object input')
assertGate(source.includes('--legacy-research-cycle'), 'legacy research cycle flag must exist')
assertGate(source.includes('SKS_RESEARCH_LEGACY_CYCLE'), 'legacy research cycle env flag must exist')
assertGate(source.includes('legacy_final_md_loop'), 'legacy final.md loop must be explicitly marked')
assertGate(legacyExecIndex > legacyIndex, 'runCodexExec final.md path must live after legacy gate')

emitGate('research:real-cycle-no-legacy-final-md', { defaultIndex, legacyIndex, legacyExecIndex })
