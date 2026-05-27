import { nowIso } from '../fsx.js'
import type { AppshotsCapability } from './appshots-detector.js'

export const APPSHOTS_OPERATOR_POLICY_SCHEMA = 'sks.appshots-operator-policy.v1'

export interface AppshotsOperatorPolicy {
  schema: typeof APPSHOTS_OPERATOR_POLICY_SCHEMA
  generated_at: string
  ok: boolean
  mode: 'not_required' | 'operator_assisted' | 'tool_available'
  operator_action_required: boolean
  privacy_safety: {
    redact_sensitive_text: boolean
    avoid_secrets_and_credentials: boolean
    require_user_visible_app_state_only: boolean
    no_background_screen_capture: boolean
  }
  accepted_sources: string[]
  blockers: string[]
  warnings: string[]
}

export function buildAppshotsOperatorPolicy(capability: AppshotsCapability, input: {
  operatorActionRecorded?: boolean
  sourcePaths?: string[]
} = {}): AppshotsOperatorPolicy {
  const operatorActionRecorded = input.operatorActionRecorded === true
  const operatorRequired = capability.operator_action_required
  const missingOperatorAction = operatorRequired && !operatorActionRecorded
  return {
    schema: APPSHOTS_OPERATOR_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: !missingOperatorAction,
    mode: capability.status === 'available' ? 'tool_available' : capability.visual_required ? 'operator_assisted' : 'not_required',
    operator_action_required: operatorRequired,
    privacy_safety: {
      redact_sensitive_text: true,
      avoid_secrets_and_credentials: true,
      require_user_visible_app_state_only: true,
      no_background_screen_capture: true
    },
    accepted_sources: input.sourcePaths?.map(String) || [],
    blockers: missingOperatorAction ? ['appshots_operator_action_missing'] : [],
    warnings: capability.visual_required && !operatorRequired ? [] : operatorRequired ? ['operator_must_explicitly_attach_or_confirm_appshot'] : []
  }
}
