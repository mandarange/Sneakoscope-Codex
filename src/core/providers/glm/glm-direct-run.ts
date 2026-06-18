import fs from 'node:fs/promises';
import path from 'node:path';
import type { SksResult } from '../../results.js';
import { nowIso, writeJsonAtomic } from '../../fsx.js';
import { resolveOpenRouterApiKey } from '../openrouter/openrouter-secret-store.js';
import { sendOpenRouterChatCompletionStream } from '../openrouter/openrouter-stream.js';
import { assertGlm52ActualModel } from './glm-52-response-guard.js';
import { GLM_52_OPENROUTER_MODEL } from './glm-52-settings.js';
import { buildGlm52Request } from './glm-52-request.js';
import { buildGlmSpeedContext } from './glm-speed-context.js';
import { parseGlmSpeedOutput } from './glm-speed-output-parser.js';
import { evaluateGlmSpeedGate } from './glm-speed-gate.js';
import { checkAndApplyGlmPatch } from './glm-patch-apply.js';
import { createGlmRunController, writeGlmRunArtifacts } from './glm-run-controller.js';
import { GLM_SPEED_LIMITS } from './glm-run-timeout.js';
import { recordGlmLoopIteration } from './glm-loop-guard.js';

export interface GlmDirectRunResult {
  readonly schema: 'sks.glm-direct-run-result.v1';
  readonly ok: boolean;
  readonly status: 'completed' | 'blocked' | 'failed' | 'timeout';
  readonly run_id: string;
  readonly task: string;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly termination_reason: string;
  readonly artifact_dir?: string;
  readonly touched_paths: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export async function runGlmDirectSpeedRun(input: {
  readonly cwd: string;
  readonly task: string;
  readonly args?: readonly string[];
  readonly dryRun?: boolean;
}): Promise<GlmDirectRunResult> {
  if (process.env.SKS_GLM_WRAPPER_ACTIVE === '1') {
    return blocked('glm-recursive-blocked', input.task, 'glm_recursive_launch_blocked', ['glm_recursive_launch_blocked']);
  }
  const controller = createGlmRunController({ limits: GLM_SPEED_LIMITS });
  controller.transition('preflight');
  const key = await resolveOpenRouterApiKey({ env: process.env });
  if (!key.key) {
    const termination = controller.terminate('blocked', 'glm_patch_gate_failed', key.blockers, [
      'set_OPENROUTER_API_KEY_or_run_sks_--mad_--glm_--repair'
    ]);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], key.blockers, termination.warnings);
  }
  controller.transition('context');
  const gitStatus = await readGitStatus(input.cwd);
  const context = await buildGlmSpeedContext({
    cwd: input.cwd,
    task: input.task,
    mentionedPaths: extractMentionedPaths(input.task),
    readFile: async (file) => fs.readFile(file, 'utf8').catch(() => null),
    ...(gitStatus ? { gitStatus } : {})
  });
  controller.transition('request');
  const request = buildGlm52Request({
    profile: 'speed',
    messages: [
      { role: 'system', content: 'Return only <sks_patch>, <sks_need_context>, or <sks_blocked>. Use unified diff for patches.' },
      { role: 'user', content: JSON.stringify({ task: input.task, context }) }
    ],
    maxTokens: 4096
  });
  const response = await sendOpenRouterChatCompletionStream({
    apiKey: key.key,
    request: {
      ...request,
      session_id: `sks-${controller.state().run_id}`
    },
    timeoutMs: GLM_SPEED_LIMITS.request_timeout_ms
  });
  if (!response.ok) {
    const reason = response.error.code === 'glm_request_timeout' ? 'glm_request_timeout' : 'glm_patch_gate_failed';
    const termination = controller.terminate(reason === 'glm_request_timeout' ? 'timeout' : 'failed', reason, [response.error.code]);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, contextOmissions: context.omitted });
    return result(reason === 'glm_request_timeout' ? 'timeout' : 'failed', controller.state().run_id, input.task, termination.reason, artifactDir, [], [response.error.code], []);
  }
  controller.transition('model_guard');
  const modelGuard = assertGlm52ActualModel(response.value.model);
  if (!modelGuard.ok) {
    const termination = controller.terminate('blocked', 'glm_model_mismatch', [modelGuard.code]);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, contextOmissions: context.omitted });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], [modelGuard.code], []);
  }
  controller.transition('parse_output');
  const parsed = parseGlmSpeedOutput(response.value.content);
  const guard = recordGlmLoopIteration({
    state: controller.state(),
    limits: GLM_SPEED_LIMITS,
    output: response.value.content,
    madeProgress: parsed.kind === 'patch',
    nowIso: nowIso()
  });
  if (!guard.ok) {
    const termination = controller.terminate('blocked', guard.reason === 'glm_loop_repeated_output' ? 'glm_loop_repeated_output' : 'glm_loop_no_progress', [guard.reason || 'glm_loop_blocked']);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, loopGuard: guard, contextOmissions: context.omitted });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], termination.blockers, []);
  }
  if (parsed.kind === 'blocked' || parsed.kind === 'need_context' || parsed.kind === 'malformed') {
    const termination = controller.terminate('blocked', parsed.kind === 'malformed' ? 'glm_loop_no_progress' : 'completed_noop', [parsed.reason || parsed.kind]);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, loopGuard: guard, contextOmissions: context.omitted });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], termination.blockers, []);
  }
  controller.transition('patch_gate');
  const gate = evaluateGlmSpeedGate(response.value.content);
  if (!gate.ok) {
    const termination = controller.terminate('blocked', 'glm_patch_gate_failed', gate.checks.filter((row) => !row.ok).map((row) => row.reason || row.id));
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, loopGuard: guard, contextOmissions: context.omitted });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], termination.blockers, []);
  }
  controller.transition('apply_patch');
  const applied = await checkAndApplyGlmPatch({ cwd: input.cwd, patch: parsed.content, apply: !input.dryRun });
  if (!applied.ok) {
    const termination = controller.terminate('blocked', 'glm_patch_gate_failed', [applied.error.code]);
    const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, loopGuard: guard, contextOmissions: context.omitted });
    return result('blocked', controller.state().run_id, input.task, termination.reason, artifactDir, [], termination.blockers, []);
  }
  controller.transition('verify');
  const termination = controller.terminate('completed', input.dryRun ? 'completed_noop' : 'completed_patch_applied');
  const artifactDir = await writeGlmRunArtifacts({ cwd: input.cwd, state: controller.state(), termination, loopGuard: guard, contextOmissions: context.omitted });
  await writeJsonAtomic(path.join(artifactDir, 'direct-run.json'), { request_model: request.model, stream: true, gate, applied: applied.value });
  return result('completed', controller.state().run_id, input.task, termination.reason, artifactDir, applied.value.touchedPaths, [], []);
}

function result(
  status: GlmDirectRunResult['status'],
  runId: string,
  task: string,
  terminationReason: string,
  artifactDir: string | undefined,
  touchedPaths: readonly string[],
  blockers: readonly string[],
  warnings: readonly string[]
): GlmDirectRunResult {
  return {
    schema: 'sks.glm-direct-run-result.v1',
    ok: status === 'completed',
    status,
    run_id: runId,
    task,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    termination_reason: terminationReason,
    ...(artifactDir ? { artifact_dir: artifactDir } : {}),
    touched_paths: touchedPaths,
    blockers,
    warnings
  };
}

function blocked(runId: string, task: string, reason: string, blockers: readonly string[]): GlmDirectRunResult {
  return result('blocked', runId, task, reason, undefined, [], blockers, []);
}

async function readGitStatus(cwd: string): Promise<string | undefined> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('close', () => resolve(stdout.trim() || undefined));
  });
}

function extractMentionedPaths(task: string): readonly string[] {
  const matches = task.match(/(?:^|\s|[`"'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?:\s|[`"']|$)/g) || [];
  return [...new Set(matches.map((value) => value.trim().replace(/^[`"']|[`"']$/g, '')))];
}
