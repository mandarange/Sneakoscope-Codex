#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { probeGoalAttachmentPreservation } from '../core/codex-control/codex-0140-feature-probes.js';

const result = await probeGoalAttachmentPreservation('codex');
assertGate(result.status === 'passed' && result.certainty === 'actual', 'goal attachment roundtrip must produce actual checksum evidence', result);
assertGate(result.evidence.some((item) => item.startsWith('sks_goal_artifact_roundtrip_sha256:')), 'goal attachment roundtrip must include checksum evidence', result);
assertGate(result.evidence.some((item) => /^large_text_bytes:\d+/.test(item)), 'goal attachment roundtrip must include large text evidence', result);
emitGate('codex:0140-goal-attachment-roundtrip', { evidence: result.evidence.length });
