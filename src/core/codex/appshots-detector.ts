import { nowIso } from '../fsx.js'

export const APPSHOTS_CAPABILITY_SCHEMA = 'sks.appshots-capability.v1'
export const APPSHOTS_OFFICIAL_DOC_URL = 'https://developers.openai.com/codex/appshots'

export interface AppshotsCapability {
  schema: typeof APPSHOTS_CAPABILITY_SCHEMA
  generated_at: string
  ok: boolean
  status: 'available' | 'operator_required' | 'not_required'
  official_doc_url: string
  visual_required: boolean
  operator_action_required: boolean
  capability_signals: string[]
  blockers: string[]
}

export function detectAppshotsCapability(input: {
  prompt?: string
  visualRequired?: boolean
  operatorActionRecorded?: boolean
  appshotsToolAvailable?: boolean
} = {}): AppshotsCapability {
  const visualRequired = input.visualRequired === true || needsVisualContext(input.prompt || '')
  const operatorActionRecorded = input.operatorActionRecorded === true
  const appshotsToolAvailable = input.appshotsToolAvailable === true
  const requiredButMissing = visualRequired && !operatorActionRecorded && !appshotsToolAvailable
  return {
    schema: APPSHOTS_CAPABILITY_SCHEMA,
    generated_at: nowIso(),
    ok: !requiredButMissing,
    status: visualRequired ? appshotsToolAvailable ? 'available' : 'operator_required' : 'not_required',
    official_doc_url: APPSHOTS_OFFICIAL_DOC_URL,
    visual_required: visualRequired,
    operator_action_required: visualRequired && !appshotsToolAvailable,
    capability_signals: [
      ...(visualRequired ? ['visual_context_requested'] : ['visual_context_not_required']),
      ...(operatorActionRecorded ? ['operator_action_recorded'] : []),
      ...(appshotsToolAvailable ? ['appshots_tool_available'] : [])
    ],
    blockers: requiredButMissing ? ['appshots_operator_action_missing_for_visual_proof'] : []
  }
}

function needsVisualContext(prompt: string): boolean {
  const text = String(prompt || '')
  return /appshot|screenshot|ui|ux|preview|browser|image|design|화면|시각|스크린샷/i.test(text) || /\bvisual\b/i.test(text)
}
