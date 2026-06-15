#!/usr/bin/env node
import { runCodexNativeDoctorMadRoutingRealBlackbox } from './pipeline-codex-native-doctor-mad-routing-real-blackbox.js'
import { runCodexNativeImageRoutingRealBlackbox } from './pipeline-codex-native-image-routing-real-blackbox.js'
import { runCodexNativeLoopRoutingRealBlackbox } from './pipeline-codex-native-loop-routing-real-blackbox.js'
import { runCodexNativeQaRoutingRealBlackbox } from './pipeline-codex-native-qa-routing-real-blackbox.js'
import { runCodexNativeResearchRoutingRealBlackbox } from './pipeline-codex-native-research-routing-real-blackbox.js'

await runCodexNativeLoopRoutingRealBlackbox()
await runCodexNativeQaRoutingRealBlackbox()
await runCodexNativeResearchRoutingRealBlackbox()
await runCodexNativeImageRoutingRealBlackbox()
await runCodexNativeDoctorMadRoutingRealBlackbox()
console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate: 'pipeline:codex-native-e2e-blackbox' }, null, 2))
