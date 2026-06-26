#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, assertMissionArtifact, emitGate, makeSearchVisibilityFixture, runSksJson } from './search-visibility-gate-lib.js';

const fixture = makeSearchVisibilityFixture('geo-llms');
const audit = runSksJson(['seo-geo-optimizer', 'audit', '--mode', 'geo', '--root', fixture, '--target', 'package', '--offline', '--json']).json;
const plan = runSksJson(['seo-geo-optimizer', 'plan', audit.mission_id, '--mode', 'geo', '--root', fixture, '--json']).json;
const llmsPlan = assertMissionArtifact(audit.mission_id, 'llms-txt-plan.json', fixture);

assertGate(audit.ok === true, 'missing llms.txt must not block GEO gate', audit);
assertGate(plan.operations === 0, 'GEO plan must not create llms.txt unless --include-llms-txt is explicit', plan);
assertGate(llmsPlan.required_for_gate === false && llmsPlan.experimental_assistive_surface === true, 'llms.txt must be optional and experimental', llmsPlan);
assertGate(!fs.existsSync(path.join(fixture, 'llms.txt')), 'llms.txt must not be created by default');

const explicitPlan = runSksJson(['seo-geo-optimizer', 'plan', audit.mission_id, '--mode', 'geo', '--root', fixture, '--include-llms-txt', '--json']).json;
assertGate(explicitPlan.operations === 1, 'explicit --include-llms-txt should plan managed llms.txt creation', explicitPlan);
const apply = runSksJson(['seo-geo-optimizer', 'apply', audit.mission_id, '--mode', 'geo', '--root', fixture, '--include-llms-txt', '--apply', '--json']).json;
assertGate(apply.ok === true && fs.existsSync(path.join(fixture, 'llms.txt')), 'explicit llms.txt apply must create managed file', apply);

emitGate('geo:llms-txt-optional', { mission_id: audit.mission_id });
