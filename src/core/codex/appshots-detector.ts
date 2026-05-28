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
  thread_attachment_discovery: AppshotsThreadAttachmentDiscovery
  blockers: string[]
}

export type AppshotsThreadAttachmentKind = 'appshot' | 'image' | 'text' | 'unknown'

export interface AppshotsThreadAttachmentMetadata {
  thread_id?: string | null
  attachment_id?: string | null
  kind?: string | null
  mime_type?: string | null
  source_app?: string | null
  source_window?: string | null
  local_only?: boolean
  codex_appshot?: boolean
}

export interface AppshotsDiscoveredThreadAttachment {
  thread_id: string | null
  attachment_id: string | null
  kind: AppshotsThreadAttachmentKind
  mime_type: string | null
  source_app: string | null
  source_window: string | null
  local_only: boolean
  codex_appshot: boolean
}

export interface AppshotsThreadAttachmentDiscovery {
  schema: 'sks.appshots-thread-attachment-discovery.v1'
  ok: boolean
  status: 'not_provided' | 'discovered' | 'missing_required'
  attachments: AppshotsDiscoveredThreadAttachment[]
  appshot_attachment_count: number
  blockers: string[]
  warnings: string[]
}

export function detectAppshotsCapability(input: {
  prompt?: string
  visualRequired?: boolean
  operatorActionRecorded?: boolean
  appshotsToolAvailable?: boolean
  threadAttachments?: AppshotsThreadAttachmentMetadata[]
} = {}): AppshotsCapability {
  const visualRequired = input.visualRequired === true || needsVisualContext(input.prompt || '')
  const operatorActionRecorded = input.operatorActionRecorded === true
  const appshotsToolAvailable = input.appshotsToolAvailable === true
  const threadAttachmentDiscovery = discoverAppshotsThreadAttachments(input.threadAttachments || [], { visualRequired })
  const hasThreadAppshot = threadAttachmentDiscovery.appshot_attachment_count > 0
  const requiredButMissing = visualRequired && !operatorActionRecorded && !appshotsToolAvailable && !hasThreadAppshot
  return {
    schema: APPSHOTS_CAPABILITY_SCHEMA,
    generated_at: nowIso(),
    ok: !requiredButMissing && threadAttachmentDiscovery.ok,
    status: visualRequired ? appshotsToolAvailable ? 'available' : 'operator_required' : 'not_required',
    official_doc_url: APPSHOTS_OFFICIAL_DOC_URL,
    visual_required: visualRequired,
    operator_action_required: visualRequired && !appshotsToolAvailable && !hasThreadAppshot,
    capability_signals: [
      ...(visualRequired ? ['visual_context_requested'] : ['visual_context_not_required']),
      ...(operatorActionRecorded ? ['operator_action_recorded'] : []),
      ...(appshotsToolAvailable ? ['appshots_tool_available'] : []),
      ...(hasThreadAppshot ? ['codex_thread_appshot_attachment_detected'] : [])
    ],
    thread_attachment_discovery: threadAttachmentDiscovery,
    blockers: [
      ...(requiredButMissing ? ['appshots_operator_action_missing_for_visual_proof'] : []),
      ...threadAttachmentDiscovery.blockers
    ]
  }
}

export function discoverAppshotsThreadAttachments(
  attachments: AppshotsThreadAttachmentMetadata[] = [],
  opts: { visualRequired?: boolean } = {}
): AppshotsThreadAttachmentDiscovery {
  const rows = attachments.map((attachment) => {
    const kind = normalizeAttachmentKind(attachment.kind, attachment.mime_type, attachment.codex_appshot === true)
    return {
      thread_id: stringOrNull(attachment.thread_id),
      attachment_id: stringOrNull(attachment.attachment_id),
      kind,
      mime_type: stringOrNull(attachment.mime_type),
      source_app: stringOrNull(attachment.source_app),
      source_window: stringOrNull(attachment.source_window),
      local_only: attachment.local_only !== false,
      codex_appshot: attachment.codex_appshot === true || kind === 'appshot'
    }
  })
  const appshotAttachmentCount = rows.filter((row) => row.codex_appshot || row.kind === 'appshot').length
  const blockers = [
    ...(opts.visualRequired === true && attachments.length > 0 && appshotAttachmentCount === 0 ? ['appshots_thread_attachment_missing_appshot_kind'] : []),
    ...rows.filter((row) => (row.codex_appshot || row.kind === 'appshot') && !row.local_only).map((row) => `appshots_thread_attachment_not_local_only:${row.attachment_id || 'unknown'}`)
  ]
  return {
    schema: 'sks.appshots-thread-attachment-discovery.v1',
    ok: blockers.length === 0,
    status: attachments.length === 0 ? 'not_provided' : blockers.length > 0 ? 'missing_required' : 'discovered',
    attachments: rows,
    appshot_attachment_count: appshotAttachmentCount,
    blockers,
    warnings: attachments.length === 0 ? ['thread_attachment_metadata_not_provided'] : []
  }
}

function needsVisualContext(prompt: string): boolean {
  const text = String(prompt || '')
  return /appshot|screenshot|ui|ux|preview|browser|image|design|화면|시각|스크린샷/i.test(text) || /\bvisual\b/i.test(text)
}

function normalizeAttachmentKind(kind?: string | null, mimeType?: string | null, codexAppshot?: boolean): AppshotsThreadAttachmentKind {
  const text = `${kind || ''} ${mimeType || ''}`.toLowerCase()
  if (codexAppshot || /appshot|codex-appshot/.test(text)) return 'appshot'
  if (/image|png|jpe?g|webp|gif/.test(text)) return 'image'
  if (/text|markdown|plain|json/.test(text)) return 'text'
  return 'unknown'
}

function stringOrNull(value?: string | null): string | null {
  const text = String(value || '').trim()
  return text || null
}
