import path from 'node:path'
import { detectCodex0138Capability, type Codex0138Capability } from '../codex-control/codex-0138-capability.js'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export interface CodexAppHandoffRequest {
  schema: 'sks.codex-app-handoff-request.v1'
  mission_id: string
  route: '$QA-LOOP' | '$Research' | '$Naruto' | '$MAD' | string
  reason: string
  thread_ref?: string | null
  workspace_path: string
  artifacts: string[]
  prompt: string
  require_desktop: boolean
  capability_required: 'codex-0.138'
}

export interface CodexAppHandoffResult {
  schema: 'sks.codex-app-handoff-result.v1'
  ok: boolean
  attempted: boolean
  launched: boolean
  status: 'pending' | 'skipped' | 'blocked_for_desktop_review'
  codex_0138_capability: Codex0138Capability
  command_line: string[]
  desktop_handoff_supported: boolean
  fallback_reason: string | null
  artifact_path: string
  prompt_artifact_path: string
  blockers: string[]
}

export function buildCodexAppHandoffPrompt(request: CodexAppHandoffRequest): string {
  return [
    'SKS Codex Desktop /app handoff request',
    `Mission: ${request.mission_id}`,
    `Route: ${request.route}`,
    `Reason: ${request.reason}`,
    `Workspace: ${request.workspace_path}`,
    request.thread_ref ? `Thread: ${request.thread_ref}` : '',
    '',
    'Artifacts:',
    ...(request.artifacts || []).map((artifact) => `- ${artifact}`),
    '',
    'Prompt:',
    request.prompt,
    '',
    'Operator instruction: open Codex Desktop with `codex /app` and continue this mission using the artifacts above. Do not treat this handoff artifact as web UI verification evidence.'
  ].filter((line) => line !== '').join('\n')
}

export async function runCodexAppHandoff(root: string, request: CodexAppHandoffRequest): Promise<CodexAppHandoffResult> {
  const capability = await detectCodex0138Capability()
  const platformSupported = process.platform === 'darwin' || process.platform === 'win32'
  const desktopSupported = capability.supports_app_handoff === true && platformSupported
  const dir = path.join(root, '.sneakoscope', 'missions', request.mission_id, 'qa-loop')
  const artifactPath = path.join(dir, 'app-handoff.json')
  const promptArtifactPath = path.join(dir, 'app-handoff-prompt.md')
  const blockers = [
    ...(capability.supports_app_handoff ? [] : ['codex_0_138_app_handoff_unavailable']),
    ...(platformSupported ? [] : ['codex_app_handoff_platform_unsupported'])
  ]
  const prompt = buildCodexAppHandoffPrompt(request)
  await writeTextAtomic(promptArtifactPath, prompt)
  const status = request.require_desktop && !desktopSupported
    ? 'blocked_for_desktop_review'
    : desktopSupported
      ? 'pending'
      : 'skipped'
  const result: CodexAppHandoffResult = {
    schema: 'sks.codex-app-handoff-result.v1',
    ok: request.require_desktop ? desktopSupported : true,
    attempted: false,
    launched: false,
    status,
    codex_0138_capability: capability,
    command_line: ['codex', '/app'],
    desktop_handoff_supported: desktopSupported,
    fallback_reason: desktopSupported
      ? 'interactive_tui_handoff_pending_operator'
      : blockers.join(';') || null,
    artifact_path: artifactPath,
    prompt_artifact_path: promptArtifactPath,
    blockers: request.require_desktop ? blockers : []
  }
  await writeJsonAtomic(artifactPath, {
    ...result,
    request,
    operator_instruction: {
      open: 'codex /app',
      prompt_artifact: path.relative(root, promptArtifactPath),
      created_at: nowIso()
    }
  })
  return result
}

export function qaLoopShouldRequestAppHandoff(input: {
  args?: string[]
  uiRequired?: boolean
  visualArtifactsPresent?: boolean
  zellijUiBlocked?: boolean
  pluginAppTemplateUnavailable?: boolean
  userRequestedDesktopReview?: boolean
} = {}) {
  const args = input.args || []
  return args.includes('--app-handoff')
    || process.env.SKS_QA_LOOP_APP_HANDOFF === '1'
    || input.visualArtifactsPresent === true
    || input.zellijUiBlocked === true
    || input.pluginAppTemplateUnavailable === true
    || input.userRequestedDesktopReview === true
    || input.uiRequired === true && process.env.SKS_QA_LOOP_APP_HANDOFF_FOR_VISUAL === '1'
}
