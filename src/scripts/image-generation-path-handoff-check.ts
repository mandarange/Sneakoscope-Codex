#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const adapter = readText('src/core/image-ux-review/imagegen-adapter.ts')
assertGate(adapter.includes('writeGeneratedImagePathContract') && adapter.includes('image_artifact_path_contract'), 'imagegen adapter must hand off saved generated image path contract')
assertGate(adapter.includes("model: 'gpt-image-2'") || adapter.includes('model: "gpt-image-2"'), 'imagegen adapter must keep gpt-image-2 model evidence')
emitGate('image:generation-path-handoff')
