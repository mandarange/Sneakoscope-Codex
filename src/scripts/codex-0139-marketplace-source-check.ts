#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-capability.js')
assertGate(mod.marketplaceSourcesPresent(JSON.stringify([{ name: 'default', source: 'remote' }])) === true, 'array marketplace shape with source must pass')
assertGate(mod.marketplaceSourcesPresent(JSON.stringify({ marketplaces: [{ name: 'default', source: 'remote' }] })) === true, 'marketplaces wrapper with source must pass')
assertGate(mod.marketplaceSourcesPresent(JSON.stringify({ items: [{ name: 'default', source: 'remote' }] })) === true, 'items wrapper with source must pass')
assertGate(mod.marketplaceSourcesPresent(JSON.stringify([])) === true, 'empty marketplace list must not fail')
assertGate(mod.marketplaceSourcesPresent('not-json') === false, 'non-json marketplace output must fail')
assertGate(mod.marketplaceSourcesPresent(JSON.stringify([{ name: 'missing-source' }])) === false, 'non-empty rows must expose source')
emitGate('codex:0139-marketplace-source')
