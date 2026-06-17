import { applyLocalLlmSmokeResult, normalizeProvider, resolveOllamaWorkerConfig, writeLocalModelConfig, readLocalModelConfig } from '../agents/ollama-worker-config.js'
import { detectInstalledLocalModelCandidate, probeLocalLlmEndpoint } from '../local-llm/local-llm-client.js'
import { runLocalLlmGenerationSmoke, localLlmSmokeSchema } from '../local-llm/local-llm-smoke.js'

export async function localModelCommand(args: string[] = []) {
  const action = normalizeLocalModelAction(args[0])
  if (action === 'enable') return emit(await enable(args.slice(1)), args)
  if (action === 'disable') return emit(await disable(), args)
  if (action === 'set-model') return emit(await setModel(args.slice(1)), args)
  if (action === 'status') return emit(await status(), args)
  const result = { schema: 'sks.local-model-command.v1', ok: false, action, blockers: ['unknown_local_model_action'] }
  process.exitCode = 1
  return emit(result, args)
}

function normalizeLocalModelAction(value: unknown): 'enable' | 'disable' | 'set-model' | 'status' | string {
  const text = String(value || 'status').trim().toLowerCase()
  if (['on', 'enable', 'enabled', 'with-local-llm-on', '켜', '켜기'].includes(text)) return 'enable'
  if (['off', 'disable', 'disabled', 'with-local-llm-off', '꺼', '끄기'].includes(text)) return 'disable'
  if (['model', 'set', 'set-model'].includes(text)) return 'set-model'
  if (['', 'status', 'state', 'check'].includes(text)) return 'status'
  return text
}

async function enable(args: string[]) {
  const model = readOption(args, '--model', firstPositional(args) || '')
  const baseUrl = readOption(args, '--base-url', '')
  const provider = readOption(args, '--provider', '')
  const think = readBoolFlag(args, '--think', '--no-think')
  const skipSmoke = args.includes('--skip-smoke') || process.env.SKS_LOCAL_LLM_TOGGLE_ONLY === '1'
  const patch: any = { enabled: true, status: 'enabled_unverified' }
  const explicitConfig = Boolean(model || baseUrl || provider)
  let detection: any = null

  if (!explicitConfig) {
    detection = await detectInstalledLocalModelCandidate()
    if (!detection) {
      const config = await writeLocalModelConfig({ enabled: false, blockers: ['local_model_not_found'] } as any)
      process.exitCode = 1
      return {
        schema: 'sks.local-model-command.v1',
        ok: false,
        action: 'enable',
        message: '확인해보니 로컬 모델이 존재하지 않아 실행할 수 없습니다.',
        config,
        detection: null,
        blockers: ['local_model_not_found']
      }
    }
    patch.provider = detection.provider
    patch.model = detection.model
    patch.base_url = detection.base_url
    patch.endpoint = detection.endpoint
  }
  if (provider) patch.provider = normalizeProvider(provider)
  if (model) patch.model = model
  if (baseUrl) {
    patch.base_url = baseUrl
    patch.endpoint = baseUrl
  }
  if (think !== null) patch.think = think
  const config = await writeLocalModelConfig(patch)
  const smoke = skipSmoke
    ? { ok: false, skipped: true, status: 'enabled_unverified' as const, reason: 'operator_skip_smoke', schema_valid: false, blockers: ['operator_skip_smoke'] }
    : await runLocalLlmGenerationSmoke(config, {
        prompt: 'Return strict JSON: {"status":"ok","summary":"local smoke passed"}',
        schema: localLlmSmokeSchema,
        timeoutMs: Math.max(60_000, Number(config.timeout_ms || 0) || 0)
      })
  const next = await writeLocalModelConfig(applyLocalLlmSmokeResult(config, smoke))
  if (!skipSmoke && smoke.ok !== true) process.exitCode = 1
  return {
    schema: 'sks.local-model-command.v1',
    ok: skipSmoke ? true : smoke.ok === true,
    action: 'enable',
    config: next,
    detection,
    smoke,
    blockers: next.blockers
  }
}

async function disable() {
  const config = await writeLocalModelConfig({ enabled: false })
  return { schema: 'sks.local-model-command.v1', ok: true, action: 'disable', config }
}

async function setModel(args: string[]) {
  const model = String(args[0] || '').trim()
  if (!model) {
    process.exitCode = 1
    return { schema: 'sks.local-model-command.v1', ok: false, action: 'set-model', blockers: ['model_missing'] }
  }
  const config = await writeLocalModelConfig({ model })
  return { schema: 'sks.local-model-command.v1', ok: true, action: 'set-model', config }
}

async function status() {
  const config = await readLocalModelConfig()
  const resolved = await resolveOllamaWorkerConfig()
  const api = await probeLocalLlmEndpoint(resolved)
  return { schema: 'sks.local-model-command.v1', ok: true, action: 'status', config, resolved, api }
}

function emit(result: any, args: string[]) {
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    return result
  }
  if (result.ok !== true) {
    if (result.message) console.log(result.message)
    console.log(`Local model: blocked (${(result.blockers || []).join(', ') || 'unknown'})`)
    return result
  }
  const config = result.config || result.resolved || {}
  console.log(`Local model: ${config.enabled ? 'enabled' : 'disabled'}`)
  console.log(`Provider: ${config.provider || 'unknown'}`)
  console.log(`Model: ${config.model || 'unknown'}`)
  console.log(`Base URL: ${config.base_url || config.baseUrl || 'unknown'}`)
  if (config.status) console.log(`Status: ${config.status}`)
  if (result.detection) console.log(`Detected: ${result.detection.source}`)
  if (config.last_smoke?.result_path) console.log(`Smoke: ${config.last_smoke.ok ? 'ok' : 'failed'} ${config.last_smoke.result_path}`)
  if (typeof config.think === 'boolean') console.log(`Think: ${config.think ? 'enabled' : 'disabled'}`)
  if (result.api) console.log(`Local model API: ${result.api.ok ? 'ok' : 'not reachable'}`)
  return result
}

function readOption(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1])
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}

function readBoolFlag(args: string[], trueName: string, falseName: string): boolean | null {
  if (args.includes(trueName)) return true
  if (args.includes(falseName)) return false
  return null
}

function firstPositional(args: string[] = []) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '')
    if (arg === '--model' || arg === '--base-url' || arg === '--provider') {
      if (args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1
      continue
    }
    if (arg.startsWith('--model=') || arg.startsWith('--base-url=') || arg.startsWith('--provider=')) continue
    if (!arg.startsWith('--')) return arg
  }
  return ''
}
