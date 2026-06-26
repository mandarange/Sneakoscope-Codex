#!/usr/bin/env node
// @ts-nocheck
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('geo-crawlers');
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'geo', '--root', fixture, '--target', 'package', '--offline', '--json']).json;
const policy = assertMissionArtifact(audit.mission_id, 'ai-crawler-policy.json', fixture);
const purposes = new Set(policy.entries.map((entry) => entry.purpose));
const agents = new Set(policy.entries.map((entry) => entry.userAgent));

assertGate(policy.policy.single_allow_ai_toggle === false && policy.policy.purpose_split_required === true, 'AI crawler policy must split purposes instead of one allow_ai toggle', policy);
for (const purpose of ['search', 'training', 'user_retrieval']) assertGate(purposes.has(purpose), `crawler purpose missing: ${purpose}`, policy);
for (const agent of ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'Claude-SearchBot', 'ClaudeBot', 'Claude-User']) assertGate(agents.has(agent), `crawler user agent missing: ${agent}`, policy);
assertGate(policy.entries.every((entry) => entry.officialSource && entry.observedAt && entry.expiresAt), 'crawler registry entries must carry dated official sources', policy);

emitGate('geo:crawler-purpose-policy', { mission_id: audit.mission_id, entries: policy.entries.length });
