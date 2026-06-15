#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';

const intakePath = process.argv[2];
if (!intakePath) throw new Error('Usage: loop-worker-fixture-child <intake.json>');
const intake = JSON.parse(await fs.readFile(intakePath, 'utf8'));
const dir = path.dirname(intake.result_path);
await fs.mkdir(dir, { recursive: true });

const workerIds = Array.from({ length: Math.max(1, Number(intake.worker_count || 1)) }, (_, index) => `${intake.loop_id}-${intake.phase}-fixture-worker-${index + 1}`);
const sessionIds = workerIds.map((id) => `${id}-${process.pid}`);
const artifactPath = path.join(dir, intake.phase === 'maker' ? 'maker-patch-candidate.json' : 'checker-findings.json');
const changedFiles = intake.phase === 'maker' ? [] : [];
const artifact = intake.phase === 'maker'
  ? {
      schema: 'sks.loop-patch-candidate.v1',
      loop_id: intake.loop_id,
      worker_ids: workerIds,
      changed_files: changedFiles,
      fixture_child_pid: process.pid,
      generated_at: new Date().toISOString()
    }
  : {
      schema: 'sks.loop-checker-findings.v1',
      loop_id: intake.loop_id,
      fresh_session: true,
      reviewed_maker_artifacts: intake.maker_artifacts || [],
      side_effects_detected: [],
      approved: true,
      worker_ids: workerIds,
      fixture_child_pid: process.pid,
      generated_at: new Date().toISOString()
    };
await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
await fs.writeFile(intake.result_path, `${JSON.stringify({
  schema: 'sks.loop-worker-run-result.v1',
  ok: true,
  mission_id: intake.mission_id,
  loop_id: intake.loop_id,
  phase: intake.phase,
  worker_count: workerIds.length,
  backend: 'deterministic-fixture',
  artifacts: [artifactPath],
  patch_candidates: intake.phase === 'maker' ? [artifactPath] : [],
  checker_findings: intake.phase === 'checker' ? [artifactPath] : [],
  changed_files: changedFiles,
  blockers: [],
  runtime_proof_path: intake.result_path,
  worker_ids: workerIds,
  session_ids: sessionIds,
  codex_native_invocation_plan: intake.codex_native_invocation_plan || null
}, null, 2)}\n`);
