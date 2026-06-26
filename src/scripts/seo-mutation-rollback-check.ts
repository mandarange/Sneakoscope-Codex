#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('seo-rollback');
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'seo', '--root', fixture, '--target', 'website', '--framework', 'static', '--url', 'https://example.test', '--offline', '--json']).json;
const plan = runSksJson(['seo-geo-optimizer', 'plan', audit.mission_id, '--mode', 'seo', '--root', fixture, '--json']).json;
assertGate(plan.operations >= 2, 'SEO rollback fixture should plan robots and sitemap creation', plan);

const apply = runSksJson(['seo-geo-optimizer', 'apply', audit.mission_id, '--mode', 'seo', '--root', fixture, '--apply', '--json']).json;
assertGate(apply.ok === true && apply.applied >= 2, 'SEO apply must create planned managed files', apply);
assertGate(fs.existsSync(path.join(fixture, 'public', 'robots.txt')) && fs.existsSync(path.join(fixture, 'public', 'sitemap.xml')), 'managed robots and sitemap must exist after apply');

const second = runSksJson(['seo-geo-optimizer', 'apply', audit.mission_id, '--mode', 'seo', '--root', fixture, '--apply', '--json']).json;
assertGate(second.ok === true, 'second apply must be idempotent', second);

const journal = fs.readFileSync(path.join(fixture, '.sneakoscope', 'missions', audit.mission_id, 'search-visibility', 'mutation-journal.jsonl'), 'utf8');
assertGate(/applied/.test(journal), 'mutation journal must record applied/idempotent events', journal);
const rollbackManifest = assertMissionArtifact(audit.mission_id, 'rollback-manifest.json', fixture);
assertGate(rollbackManifest.operations.length >= 2, 'rollback manifest must preserve inverse operations after idempotent apply', rollbackManifest);

const rollback = runSksJson(['seo-geo-optimizer', 'rollback', audit.mission_id, '--mode', 'seo', '--root', fixture, '--apply', '--json']).json;
assertGate(rollback.ok === true && rollback.rolled_back >= 2, 'rollback must reverse mission-owned operations', rollback);
assertGate(!fs.existsSync(path.join(fixture, 'public', 'robots.txt')) && !fs.existsSync(path.join(fixture, 'public', 'sitemap.xml')), 'rollback must remove mission-created files');

emitGate('seo:mutation-rollback', { mission_id: audit.mission_id, applied: apply.applied, rolled_back: rollback.rolled_back });
