#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const src = readText('src/core/commands/naruto-command.ts')
for (const token of ['$Naruto starting:', 'clones requested:', 'target active workers:', '$Naruto parallel proof:', 'speedup:']) assertGate(src.includes(token), `Naruto UX token missing: ${token}`)
emitGate('naruto:parallelism-ux')
