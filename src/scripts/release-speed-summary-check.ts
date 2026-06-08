#!/usr/bin/env node
import { assertGate, emitGate, packageScripts, readText } from './sks-1-18-gate-lib.js'

assertGate(readText('src/scripts/release-speed-summary.ts').includes('sks.release-speed-summary.v1'), 'release speed summary script missing schema')
assertGate(Boolean(packageScripts()['release:speed-summary']), 'release:speed-summary package script missing')
emitGate('release:speed-summary', { script: 'release:speed-summary' })
