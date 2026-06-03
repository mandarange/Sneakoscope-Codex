import { runCodexTask as runTask } from './codex-task-runner.js'

export interface RequestedScopeContract {
  id?: string
  route?: string
  read_only?: boolean
  allowed_paths?: string[]
  write_paths?: string[]
  user_confirmed_full_access?: boolean
  mad_sks_authorized?: boolean
  resume_thread_id?: string | null
  [key: string]: unknown
}

export interface CodexTaskInput {
  route: string
  tier?: 'orchestrator' | 'worker'
  missionId: string
  workItemId?: string
  slotId?: string
  generationIndex?: number
  sessionId?: string
  cwd: string
  prompt: string
  inputFiles?: string[]
  inputImages?: string[]
  outputSchemaId: string
  outputSchema: Record<string, unknown>
  sandboxPolicy: 'read-only' | 'workspace-write' | 'full-access'
  requestedScopeContract: RequestedScopeContract
  reliabilityPolicy?: {
    maxEmptyResultRetries?: number
    idleTimeoutMs?: number
    timeoutClass?: 'short' | 'standard' | 'long'
  }
  mutationLedgerRoot: string
  zellijPaneId?: string | null
}

export interface CodexTaskResult {
  ok: boolean
  backend: 'codex-sdk'
  sdkThreadId: string
  sdkRunId: string | null
  streamEventCount: number
  structuredOutputValid: boolean
  workerResultPath: string
  patchEnvelopePath?: string | null
  blockers: string[]
  reliabilityShield?: Record<string, unknown>
  ultraRouterDecision?: Record<string, unknown>
}

export async function runCodexTask(input: CodexTaskInput): Promise<CodexTaskResult & Record<string, unknown>> {
  return runTask(input)
}
