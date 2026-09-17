/**
 * Shared contract for the optional local decision provider.
 *
 * Everything here is a *proposal* consumed by trusted SKS code. The model
 * never produces these objects itself: the Python worker maps candidate logits
 * onto fixed enum values and trusted code assembles the envelope. Field names
 * are shared verbatim with the Python wire schema and the test fixtures.
 */

export type DecisionMode = 'off' | 'shadow' | 'advisory'
export type DecisionKind = 'planning' | 'recovery'
export type PlanningField = 'workloadClass' | 'fanoutAdvice' | 'effortAdvice'
export type RecoveryField = 'failureClass' | 'nextAction'
export type DecisionField = PlanningField | RecoveryField

export type DecisionCountSource = 'operator' | 'route_contract' | 'automatic'
export type DecisionEffort = 'low' | 'medium' | 'high' | 'max'
export type DecisionGateProfile = 'none' | 'minimal' | 'scoped' | 'full'

export interface DecisionScope {
  projectDigest: string
  missionId: string
  workflowRunId: string
  snapshotDigest: string
}

export interface DecisionFacts {
  taskProfile: string
  gateProfile: DecisionGateProfile
  countSource: DecisionCountSource
  baselineAgents: number
  baselineEffort: DecisionEffort | null
  rolePreferenceExplicit: boolean
  highRisk: boolean
  evidenceFresh: boolean
  failedChecks: number
  attemptIndex: number
}

export interface DecisionInput {
  schemaVersion: 1
  requestId: string
  kind: DecisionKind
  scope: DecisionScope
  /** Bounded, redacted text. Raw logs that may carry secrets are never stored. */
  summary: string
  facts: DecisionFacts
}

export interface DecisionChoice {
  value: string
  candidateProbability: number
}

export interface DecisionFieldResult {
  value: string
  /** Every allowed candidate exactly once. */
  choices: DecisionChoice[]
  calibrationStatus: 'uncalibrated'
  margin: number
}

export type DecisionImplementationOrigin = 'audited_upstream' | 'sks'

export interface DecisionModelEvidence {
  modelId: string
  modelRevision: string
  engineVersion: string
  tokenizerDigest: string
  quantization: string
  implementationOrigin: DecisionImplementationOrigin
}

export type DecisionFailureCode =
  | 'disabled' | 'ineligible' | 'service_not_ready'
  | 'unsupported_platform' | 'model_missing' | 'model_incompatible'
  | 'invalid_request' | 'invalid_response' | 'unsupported_tokenization'
  | 'busy' | 'timeout' | 'cancelled' | 'worker_crashed'
  | 'oom' | 'stale_scope' | 'low_signal' | 'policy_blocked'

export interface DecisionTiming {
  queueMs: number
  inferenceMs: number
  totalMs: number
  coldStart: boolean
}

export interface DecisionCompute {
  inputTokens: number | null
  inputTokenEvidence: string | null
  forwardPasses: number
  sharedPrefill: boolean
}

export interface DecisionOkResult {
  status: 'ok'
  requestId: string
  scope: DecisionScope
  kind: DecisionKind
  fields: Partial<Record<DecisionField, DecisionFieldResult>>
  model: DecisionModelEvidence
  timing: DecisionTiming
  compute: DecisionCompute
}

export interface DecisionNonOkResult {
  status: 'abstain' | 'unavailable'
  requestId: string
  reason: DecisionFailureCode
}

export type DecisionResult = DecisionOkResult | DecisionNonOkResult

export interface LocalDecisionProvider {
  decide(input: DecisionInput, signal: AbortSignal): Promise<DecisionResult>
}

export interface DecisionPolicyResult {
  action: 'keep_baseline' | 'offer_advisory'
  reason: string
  advice: Partial<Record<DecisionField, string>>
}

/** Install receipt written only after staging, digest verification and atomic promotion. */
export interface ModelInstallReceipt {
  schemaVersion: 1
  modelId: string
  /** Resolved immutable commit, never a branch name. */
  modelRevision: string
  /** Verified, user-owned snapshot directory. */
  localSnapshotPath: string
  tokenizerDigest: string
  weightManifestDigest: string
  /** Read from the model config; never inferred from the repo name. */
  quantization: string
  runtimeLockDigest: string
  engineVersion: string
  implementationOrigin: DecisionImplementationOrigin
  licenseEvidencePaths: string[]
  installedAt: string
  /** Only a runtime readiness receipt for the same digests may link this to true. */
  realModelVerified: boolean
  /** Audited upstream engine reference used as design evidence (no code is executed from it). */
  engineReference: {
    repoId: string
    revision: string
    license: string
    sourceDigests: Record<string, string>
  } | null
  python: {
    /** Absolute interpreter path inside the SKS-owned virtualenv. */
    venvPython: string
    /** Real path of the base interpreter the venv links to, verified at start. */
    basePythonRealpath: string
    version: string
    platform: string
  }
  packageDigest: string
  inventory: string[]
}

export interface LocalDecisionConfig {
  schemaVersion: 1
  mode: DecisionMode
  /** Fraction of eligible planning requests sampled in shadow mode; reproducible from the scope hash. */
  shadowSampleRate: number
  updatedAt: string | null
}
