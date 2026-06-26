#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, listSourceFiles, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('seo-readonly');
const before = listSourceFiles(fixture);
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'website', '--framework', 'static', '--url', 'https://example.test', '--offline', '--json']).json;
const plan = runSksJson(['seo-geo-optimizer', 'plan', audit.mission_id, '--mode', 'seo', '--root', fixture, '--json']).json;
const blockedApply = runSksJson(['seo-geo-optimizer', 'apply', audit.mission_id, '--mode', 'seo', '--root', fixture, '--json'], { allowFailure: true }).json;
const after = listSourceFiles(fixture);

assertGate(JSON.stringify(before) === JSON.stringify(after), 'audit/plan/apply-without-flag must not mutate project source files', { before, after });
assertGate(plan.operations > 0, 'readonly fixture should still compile a mutation plan', plan);
assertGate(blockedApply.ok === false && blockedApply.blockers.includes('apply_requires_explicit_--apply'), 'apply must require explicit --apply', blockedApply);
assertGate(!fs.existsSync(path.join(fixture, 'public', 'robots.txt')) && !fs.existsSync(path.join(fixture, 'public', 'sitemap.xml')), 'policy files must not be created without --apply');

emitGate('seo:no-mutation-by-default', { mission_id: audit.mission_id, planned_operations: plan.operations });
