import type { CodexTaskInput } from '../codex-control/codex-control-plane.js'
import type { CapabilityCard } from './capability-card.js'

export interface TaskClassification {
  tier: 'orchestrator' | 'worker'
  image_required: boolean
  write_required: boolean
  research_required: boolean
  risk_class: 'low' | 'medium' | 'high'
  threshold: number
  signals: string[]
}

export function classifyCodexTask(input: CodexTaskInput): TaskClassification {
  const prompt = String(input.prompt || '')
  const writePaths = Array.isArray(input.requestedScopeContract?.write_paths) ? input.requestedScopeContract.write_paths : []
  const workerSignals = [
    input.slotId,
    input.workItemId,
    input.sessionId,
    /worker|slot|patch|qa shard|research shard|work item/i.test(prompt) ? 'prompt_worker_signal' : ''
  ].filter(Boolean)
  const orchestratorSignals = [
    /\bstrategy|planning|final synthesis|conflict resolution|approval\b/i.test(prompt) ? 'prompt_orchestrator_signal' : '',
    input.route && !input.slotId && !input.workItemId ? 'route_without_slot' : ''
  ].filter(Boolean)
  const tier = input.tier || (workerSignals.length > orchestratorSignals.length ? 'worker' : 'orchestrator')
  const imageRequired = Array.isArray(input.inputImages) && input.inputImages.length > 0
  const writeRequired = input.sandboxPolicy !== 'read-only' || writePaths.length > 0
  const researchRequired = /\bresearch|source intelligence|docs|survey|discover\b/i.test(`${input.route} ${prompt}`)
  const riskClass = input.sandboxPolicy === 'full-access' ? 'high' : writeRequired ? 'medium' : 'low'
  return {
    tier,
    image_required: imageRequired,
    write_required: writeRequired,
    research_required: researchRequired,
    risk_class: riskClass,
    threshold: tier === 'orchestrator' ? 0.72 : 0.62,
    signals: [...workerSignals.map(String), ...orchestratorSignals.map(String)]
  }
}

export function scoreCapabilityCard(card: CapabilityCard, classification: TaskClassification) {
  if (classification.tier !== card.tier) return 0
  if (classification.image_required && !card.supports_images) return 0
  if (classification.write_required && !card.supports_write) return 0
  if (classification.research_required && !card.supports_research && card.tier !== 'orchestrator') return 0
  let score = card.reliability
  if (classification.risk_class === 'high') score -= 0.08
  if (classification.risk_class === 'medium') score -= 0.03
  if (classification.research_required && card.supports_research) score += 0.04
  if (classification.image_required && card.supports_images) score += 0.03
  return Math.max(0, Math.min(1, Number(score.toFixed(3))))
}
