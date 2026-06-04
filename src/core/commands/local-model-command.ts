import { resolveOllamaWorkerConfig, writeLocalModelConfig, readLocalModelConfig } from '../agents/ollama-worker-config.js'

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
  const think = readBoolFlag(args, '--think', '--no-think')
  const patch: any = { enabled: true, provider: 'ollama' }
  if (model) patch.model = model
  if (baseUrl) patch.base_url = baseUrl
  if (think !== null) patch.think = think
  const config = await writeLocalModelConfig(patch)
  return { schema: 'sks.local-model-command.v1', ok: true, action: 'enable', config }
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
  const api = await probeOllama(resolved.base_url)
  return { schema: 'sks.local-model-command.v1', ok: true, action: 'status', config, resolved, api }
}

async function probeOllama(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) })
    const text = await response.text()
    return { ok: response.ok, status: response.status, data: response.ok ? JSON.parse(text) : null }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function emit(result: any, args: string[]) {
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    return result
  }
  if (result.ok !== true) {
    console.log(`Local model: blocked (${(result.blockers || []).join(', ') || 'unknown'})`)
    return result
  }
  const config = result.config || result.resolved || {}
  console.log(`Local model: ${config.enabled ? 'enabled' : 'disabled'}`)
  console.log(`Provider: ollama`)
  console.log(`Model: ${config.model || 'unknown'}`)
  console.log(`Base URL: ${config.base_url || config.baseUrl || 'unknown'}`)
  if (typeof config.think === 'boolean') console.log(`Think: ${config.think ? 'enabled' : 'disabled'}`)
  if (result.api) console.log(`Ollama API: ${result.api.ok ? 'ok' : 'not reachable'}`)
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
    if (arg === '--model' || arg === '--base-url') {
      if (args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1
      continue
    }
    if (arg.startsWith('--model=') || arg.startsWith('--base-url=')) continue
    if (!arg.startsWith('--')) return arg
  }
  return ''
}
