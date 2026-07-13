import { stripVisibleDecisionAnswerBlocks } from '../routes.js'

export function extractLastMessage(payload: any = {}) {
  return payload.last_assistant_message || payload.assistant_message || payload.message || payload.response || payload.raw || ''
}

export function extractUserPrompt(payload: any = {}) {
  return payload.prompt
    || payload.user_prompt
    || payload.userPrompt
    || payload.message
    || payload.input?.prompt
    || payload.input?.message
    || payload.raw
    || ''
}

export function conversationId(payload: any = {}) {
  return String(payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || payload.cwd || 'default')
}

export function explicitConversationId(payload: any = {}) {
  return payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || null
}

export function hookTurnId(payload: any = {}) {
  return String(payload.turn_id || payload.turnId || payload.metadata?.turn_id || payload.metadata?.turnId || '')
}

export function extractCommand(payload: any = {}) {
  return payload.command || payload.tool_input?.command || payload.toolInput?.command || payload.input?.command || payload.tool?.input?.command || ''
}

export function codexGitActionMetadataText(payload: any = {}) {
  const seen = new Set()
  const out: any[] = []
  const interesting = new Set([
    'action',
    'intent',
    'operation',
    'permission',
    'description',
    'kind',
    'type',
    'feature',
    'tool_name',
    'toolName',
    'name',
    'label',
    'title',
    'source',
    'event',
    'hook',
    'hook_name',
    'hookName',
    'hook_event_name',
    'hookEventName',
    'id',
    'command'
  ])
  const noisy = new Set([
    'prompt',
    'user_prompt',
    'userPrompt',
    'message',
    'assistant_message',
    'last_assistant_message',
    'response',
    'raw',
    'stdout',
    'stderr'
  ])
  function walk(value: any, depth: any = 0, parentKey: any = '') {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return
    seen.add(value)
    for (const [key, candidate] of Object.entries(value)) {
      if (noisy.has(key)) continue
      if (typeof candidate === 'string') {
        if (interesting.has(key) || /\b(?:codex[_\s-]*app|git[_\s-]*actions?|codex_git_|gitCommit|gitPush|pull\s+request)\b/i.test(candidate)) {
          out.push(`${key}:${candidate}`)
        }
        continue
      }
      if (candidate && typeof candidate === 'object') {
        const allowedContainer = interesting.has(key)
          || /^(?:input|metadata|context|client|thread|session|request|payload|tool|tool_input|toolInput|permission_request|permissionRequest)$/i.test(key)
          || parentKey
        if (allowedContainer) walk(candidate, depth + 1, key)
      }
    }
  }
  walk(payload)
  return out.join(' ')
}

export function codexGitActionMetadataSignal(text: any = '') {
  const s = String(text || '')
  if (!s) return false
  const action = String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
  if (/\bcodex\s*app\b[\s\S]{0,120}\bgit\b[\s\S]{0,120}\b(?:action|actions|commit|push|pr|pull request)\b/i.test(action)) return true
  if (/\bgit\s*actions?\b[\s\S]{0,120}\b(?:commit|push|pr|pull request|commit\s*(?:and|&)\s*push)\b/i.test(action)) return true
  if (/\bcodex\s*git\s*(?:commit|push|pr|pull request|commit\s*(?:and|&)\s*push)\b/i.test(action)) return true
  if (/\b(?:git\s*)?(?:commit|push|commit\s*(?:and|&)\s*push|create\s+(?:a\s+)?pull\s+request|pull\s+request|pr)\b/i.test(action)) {
    return /\b(?:action|intent|operation|permission|feature|tool\s*name|source|event|hook|name|label|title|type|kind|id)\s*:/i.test(action)
  }
  return false
}

export function toolFailed(payload: any = {}) {
  const candidates = [
    payload.exit_code,
    payload.exitCode,
    payload.tool_response?.exit_code,
    payload.toolResponse?.exitCode,
    payload.result?.exit_code,
    payload.result?.exitCode
  ]
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue
    const n = Number(candidate)
    if (Number.isFinite(n)) return n !== 0
  }
  if (payload.isError === true || payload.tool_response?.isError === true || payload.toolResponse?.isError === true || payload.result?.isError === true) return true
  if (payload.success === false || payload.tool_response?.success === false || payload.toolResponse?.success === false || payload.result?.success === false) return true
  if (payload.executed === false) return true
  return false
}

export function compactAnswerContext(prompt: any = '') {
  return [
    'SKS answer-only pipeline active (light turn).',
    'Answer the user directly. Do not create or continue a mission, prepare a route, reconcile project skills, load active route context, read TriWiki/code-pack preflight state, or open a subagent workflow for this turn.',
    'Use tools only when the answer itself needs current repository facts, official documentation, web evidence, or another source explicitly requested by the user.',
    `Question: ${String(prompt || '').trim()}`
  ].join('\n')
}

export function looksLikeMadSksConfirmationPrompt(prompt: any = '') {
  return /^(yes|y|no|n|confirm|confirmed|approve|approved|proceed|continue|ok|okay|stop|abort|cancel|deny|denied|네|예|응|아니|아니요|허용|승인|진행|계속|중단|취소|거부|삭제\s*허용|테이블\s*삭제\s*허용)(?=$|\s|[.!?。！？,，])/i.test(String(prompt || '').trim())
}

export function observedParentModel(payload: any = {}) {
  const value = payload.parent_model
    || payload.parentModel
    || payload.model
    || payload.metadata?.parent_model
    || payload.metadata?.model
    || payload.session?.model
    || null
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function observedParentModelMismatch(model: any, expectedModel: string) {
  const value = String(model || '').trim()
  if (!value) return false
  return value.toLowerCase() !== expectedModel && !/gpt[-_. ]?5\.6[-_. ]?sol|\bsol(?:\s+max)?\b/i.test(value)
}

export function looksLikeCodexUiSettingsEvent(payload: any = {}) {
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload))
  const haystack = [
    payload.action,
    payload.intent,
    payload.operation,
    payload.permission,
    payload.description,
    payload.kind,
    payload.type,
    payload.feature,
    payload.source,
    payload.event,
    payload.hook,
    payload.hook_name,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source,
    payload.context?.surface,
    payload.session?.surface
  ].filter(Boolean).join(' ')
  return !prompt && /\b(?:settings|preferences|profile|speed|fast[_\s-]*mode|reasoning|model[_\s-]*select|codex[_\s-]*app)\b/i.test(haystack)
}

export function looksLikeCodexGitAction(payload: any = {}) {
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload))
  const metadataText = codexGitActionMetadataText(payload)
  const haystack = [
    metadataText,
    payload.action,
    payload.intent,
    payload.operation,
    payload.permission,
    payload.description,
    payload.kind,
    payload.type,
    payload.feature,
    payload.tool_name,
    payload.toolName,
    payload.source,
    payload.event,
    payload.hook,
    payload.hook_name,
    payload.input?.action,
    payload.input?.intent,
    payload.input?.operation,
    payload.input?.feature,
    payload.input?.source,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source
  ].filter(Boolean).join(' ')
  const codexAppGitSignal = /\bcodex[_\s-]*app\b[\s\S]{0,80}\bgit\b[\s\S]{0,80}\b(?:action|actions|commit|push|pr)\b/i.test(haystack)
  const gitActionSignal = /\bgit[_\s-]*actions?\b[\s\S]{0,80}\b(?:commit|push|commit[\s_-]*(?:and|&)?[\s_-]*push)\b/i.test(haystack)
  const appSignal = codexGitActionMetadataSignal(metadataText)
    || codexAppGitSignal
    || gitActionSignal
    || /\b(?:codex[_\s-]*(?:app[_\s-]*)?)?(?:git[_\s-]*)?(?:commit[_\s-]*message|git[_\s-]*commit|git[_\s-]*push|git[_\s-]*pr|codex_git_commit|codex_git_push|codex_git_pr)\b/i.test(haystack)
    || /커밋\s*메시지\s*생성/i.test(haystack)
  const promptSignal = /\bgenerate(?:\s+a)?(?:\s+git)?\s+commit\s+message\b/i.test(prompt)
    || /\bcommit\s+message\b[\s\S]{0,80}\b(?:staged|diff|changes?|git)\b/i.test(prompt)
    || looksLikeStockCodexGitActionPrompt(prompt)
    || /커밋\s*메시지\s*생성/i.test(prompt)
  if (!appSignal && !promptSignal) return false
  if (looksLikeStockCodexGitActionPrompt(prompt)) return true
  if (appSignal) return true
  return !looksLikeUserImplementationRequest(prompt)
}

export function looksLikeStockCodexGitActionPrompt(prompt: any = '') {
  const text = String(prompt || '').trim()
  if (!text || text.length > 120) return false
  return /^(?:generate\s+(?:a\s+)?git\s+commit\s+message(?:\s+for\s+(?:the\s+)?(?:staged\s+)?diff)?|commit\s+changes|commit\s+and\s+push\s+changes|push\s+changes|create\s+(?:a\s+)?commit|create\s+(?:a\s+)?pull\s+request)\.?$/i.test(text)
}

export function looksLikeCodexGitActionStopCompletion(last: any = '', payload: any = {}) {
  const text = String(last || '').trim()
  const metadataText = codexGitActionMetadataText(payload)
  const haystack = [
    metadataText,
    payload.action,
    payload.intent,
    payload.operation,
    payload.kind,
    payload.type,
    payload.feature,
    payload.source,
    payload.event,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source
  ].filter(Boolean).join(' ')
  if (codexGitActionMetadataSignal(metadataText)) return true
  if (/\bcodex[_\s-]*app\b[\s\S]{0,80}\bgit\b[\s\S]{0,80}\b(?:action|commit|push|pr)\b/i.test(haystack)) return true
  if (!text || text.length > 180) return false
  return /^(?:commit(?:ted)?(?:\s+and\s+pushed)?(?:\s+changes)?(?:\s+complete[.!]?)?|push(?:ed)?(?:\s+changes)?(?:\s+complete[.!]?)?|created\s+(?:a\s+)?pull\s+request[.!]?)$/i.test(text)
}

function looksLikeUserImplementationRequest(text: any = '') {
  return /(fix|bug|broken|error|issue|implement|change|update|repair|수정|버그|오류|에러|문제|고쳐|고치|해결|변경|수리|패치|안생기|안\s*생기)/i.test(String(text || ''))
}
