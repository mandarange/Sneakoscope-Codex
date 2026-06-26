#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runSks, runSksJson } from './search-visibility-gate-lib.js';

const commands = runSksJson(['commands', '--json']).json;
assertGate(commands.commands.some((row) => row.name === 'seo-geo-optimizer' && /unified SEO\/GEO optimizer/i.test(row.description)), 'commands --json must expose seo-geo-optimizer');
assertGate(!commands.commands.some((row) => row.name === 'seo' || row.name === 'geo'), 'commands --json must not expose split seo/geo command surfaces');

const optimizerUsage = runSks(['usage', 'seo-geo-optimizer']);
assertGate(/sks seo-geo-optimizer \[seo\|geo\] doctor\|audit\|plan\|apply\|verify\|status\|rollback\|fixture/.test(optimizerUsage.stdout), 'usage seo-geo-optimizer must expose unified lifecycle');

const doctor = runSksJson(['seo-geo-optimizer', 'doctor', '--mode', 'geo', '--json']).json;
assertGate(doctor.route === '$SEO-GEO-OPTIMIZER' && doctor.schema === 'sks.search-visibility.doctor-command.v1', 'optimizer geo doctor must preserve unified route identity', doctor);

const invalid = runSks(['seo-geo-optimizer', 'nonsense-subcommand', '--mode', 'geo'], { allowFailure: true });
assertGate(invalid.status === 2 && /Usage: sks seo-geo-optimizer/.test(invalid.stderr), 'invalid optimizer subcommand must exit 2 with usage', {
  status: invalid.status,
  stdout: invalid.stdout,
  stderr: invalid.stderr,
});

emitGate('geo:cli-blackbox', { adapter: doctor.adapter, confidence: doctor.confidence });
