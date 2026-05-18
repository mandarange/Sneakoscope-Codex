import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseScoutOutputFile, parseScoutOutputText } from '../../src/core/scouts/scout-output-parser.mjs';

const role = {
  id: 'scout-1-code-surface',
  role: 'Repo / Code Surface Scout'
};

test('parseScoutOutputText extracts fenced scout-result JSON', () => {
  const parsed = parseScoutOutputText([
    'Here is the result:',
    '```json',
    '{"schema":"sks.scout-result.v1","scout_id":"scout-1-code-surface","read_only":true,"summary":"ok"}',
    '```'
  ].join('\n'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.schema, 'sks.scout-result.v1');
});

test('parseScoutOutputFile normalizes real scout output with source file metadata', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-output-'));
  const outputFile = path.join(dir, 'scout.codex.md');
  const stdoutFile = path.join(dir, 'scout.stdout.log');
  const stderrFile = path.join(dir, 'scout.stderr.log');
  await fs.writeFile(outputFile, JSON.stringify({
    schema: 'sks.scout-result.v1',
    scout_id: role.id,
    role: role.role,
    route: '$Team',
    status: 'done',
    read_only: true,
    summary: 'Parsed from real engine output.',
    findings: [{ claim: 'Finding from output' }],
    suggested_tasks: [{ title: 'Task from output', verification: ['node --test'] }]
  }), 'utf8');
  const result = await parseScoutOutputFile({
    outputFile,
    stdoutFile,
    stderrFile,
    missionId: 'M-test',
    route: '$Team',
    role,
    engine: 'codex-exec-parallel',
    realParallel: true
  });
  assert.equal(result.schema, 'sks.scout-result.v1');
  assert.equal(result.status, 'done');
  assert.equal(result.source_policy, 'parsed_scout_output');
  assert.equal(result.source, 'real_engine_output');
  assert.equal(result.source_file, outputFile);
  assert.equal(result.parsed, true);
  assert.deepEqual(result.parse_issues, []);
  assert.equal(result.source_details.output_file, outputFile);
  assert.equal(result.source_details.stdout_file, stdoutFile);
  assert.equal(result.source_details.stderr_file, stderrFile);
  assert.equal(result.findings[0].claim, 'Finding from output');
});

test('parseScoutOutputFile blocks unparseable real scout output', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-output-bad-'));
  const outputFile = path.join(dir, 'scout.codex.md');
  await fs.writeFile(outputFile, 'not json', 'utf8');
  const result = await parseScoutOutputFile({
    outputFile,
    missionId: 'M-test',
    route: '$Team',
    role,
    engine: 'codex-exec-parallel',
    realParallel: true
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.source_policy, 'parse_failed_blocked');
  assert.equal(result.parsed, false);
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('scout_output_parse_failed:')));
});
