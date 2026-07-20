import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  HOST_CAPABILITY_HOOK_PENDING_RUNTIME_FILENAME,
  HOST_CAPABILITY_HOOK_RUNTIME_FILENAME,
  createHostCapabilityHookRuntimeBinding,
  requestHostCapabilities,
  resolveHostCapabilityHookPendingRuntime,
  resolveHostCapabilityHookRuntimeBinding,
  type HostCapabilityHookRuntimeBinding
} from '../agent-bridge/host-capability-runtime.js';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import { missionDir } from '../mission.js';

export function activeNarutoParentLaunchMissionId(): string {
  return process.env.SKS_NARUTO_PARENT_LAUNCH === '1'
    ? String(process.env.SKS_NARUTO_PARENT_MISSION_ID || '').trim()
    : '';
}

function activeNarutoParentWorkflowRunId(): string {
  return process.env.SKS_NARUTO_PARENT_LAUNCH === '1'
    ? String(process.env.SKS_NARUTO_PARENT_WORKFLOW_RUN_ID || '').trim()
    : '';
}

function activeNarutoParentHostCapabilityNonce(): string {
  return process.env.SKS_NARUTO_PARENT_LAUNCH === '1'
    ? String(process.env.SKS_NARUTO_PARENT_HOST_CAPABILITY_NONCE || '').trim()
    : '';
}

export async function claimStandaloneParentHostCapabilityRuntime(input: {
  root: string;
  missionId: string;
  sessionScope: string;
  explicitSession: boolean;
}): Promise<{
  workflowRunId: string;
  binding: HostCapabilityHookRuntimeBinding | null;
  blocker: string;
}> {
  const dir = missionDir(input.root, input.missionId);
  const plan: any = await readJson(path.join(dir, 'subagent-plan.json'), null).catch(() => null);
  const plannedRunId = String(plan?.workflow_run_id || '').trim();
  const launchRunId = activeNarutoParentWorkflowRunId();
  if (launchRunId && plannedRunId && launchRunId !== plannedRunId) {
    return { workflowRunId: '', binding: null, blocker: 'host_capability_parent_workflow_run_mismatch' };
  }
  const workflowRunId = launchRunId || plannedRunId;
  const request = requestHostCapabilities(plan?.goal || '');
  if (request.capability_ids.length === 0) {
    return { workflowRunId, binding: null, blocker: '' };
  }
  if (!input.explicitSession || !input.sessionScope) {
    return { workflowRunId, binding: null, blocker: 'host_capability_child_session_scope_missing' };
  }
  const launchNonce = activeNarutoParentHostCapabilityNonce();
  if (!workflowRunId || !launchNonce) {
    return { workflowRunId, binding: null, blocker: 'host_capability_parent_binding_identity_missing' };
  }
  try {
    return await withFileLock({
      lockPath: path.join(dir, '.host-capability-hooks.lock'),
      timeoutMs: 5_000,
      staleMs: 60_000
    }, async () => {
      const rawBinding = await readJson(path.join(dir, HOST_CAPABILITY_HOOK_RUNTIME_FILENAME), null).catch(() => null);
      if (rawBinding) {
        const resolved = resolveHostCapabilityHookRuntimeBinding(rawBinding, {
          missionId: input.missionId,
          workflowRunId,
          sessionScope: input.sessionScope,
          request
        });
        return { workflowRunId, binding: resolved.binding, blocker: resolved.blocker };
      }
      const rawPending = await readJson(
        path.join(dir, HOST_CAPABILITY_HOOK_PENDING_RUNTIME_FILENAME),
        null
      ).catch(() => null);
      const resolvedPending = resolveHostCapabilityHookPendingRuntime(rawPending, {
        missionId: input.missionId,
        workflowRunId,
        launchNonce,
        request
      });
      if (!resolvedPending.pending) {
        return { workflowRunId, binding: null, blocker: resolvedPending.blocker };
      }
      const binding = createHostCapabilityHookRuntimeBinding({
        missionId: input.missionId,
        workflowRunId,
        sessionScope: input.sessionScope,
        runtime: resolvedPending.pending.runtime
      });
      await fsp.rm(path.join(dir, HOST_CAPABILITY_HOOK_PENDING_RUNTIME_FILENAME));
      await writeJsonAtomic(path.join(dir, HOST_CAPABILITY_HOOK_RUNTIME_FILENAME), binding);
      return { workflowRunId, binding, blocker: '' };
    });
  } catch {
    return { workflowRunId, binding: null, blocker: 'host_capability_child_session_binding_failed' };
  }
}
