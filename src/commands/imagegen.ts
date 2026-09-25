import path from 'node:path'
import { flag, readOption } from '../cli/args.js'
import { printJson } from '../cli/output.js'
import { readDecisionConfig, jevEnabled } from '../core/decisions/config.js'
import { imagegenConfigPath, imagegenSelection, readImagegenConfig, writeImagegenConfig, isOpenRouterModelId, type ImagegenConfig } from '../core/imagegen/imagegen-config.js'
import { generateSksImage } from '../core/imagegen/imagegen-generate.js'
import { listOpenRouterImageModels } from '../core/imagegen/openrouter-images.js'
import { decideImagegenParameters } from '../core/imagegen/imagegen-jev.js'
import { resolveOpenRouterApiKey } from '../core/providers/openrouter/openrouter-secret-store.js'

export const IMAGEGEN_STATUS_SCHEMA = 'sks.imagegen-status.v1' as const

const USAGE = [
  'Usage: sks imagegen status|models|enable|disable|generate [options] [--json]',
  '  status                         Show the active image mode (Codex default or custom OpenRouter model).',
  '  models [--refresh]             List OpenRouter models that output images.',
  '  enable --model <id>            Use this OpenRouter image model through the SKS Desktop Bridge.',
  '  disable                        Go back to Codex default image generation.',
  '  generate --prompt <text> --out <file> [--reference <file>]... [--aspect <ratio>] [--quality <q>]',
  '                                 Make an image with the active mode and write evidence next to it.'
].join('\n')

async function statusPayload(config: ImagegenConfig, env: NodeJS.ProcessEnv, extra: Record<string, unknown> = {}) {
  const selection = imagegenSelection(config)
  const key = await resolveOpenRouterApiKey({ env }).catch(() => ({ key: null }))
  const jev = await readDecisionConfig(env).then(jevEnabled).catch(() => false)
  const warnings: string[] = []
  if (config.mode === 'openrouter' && !key.key) warnings.push('openrouter_key_missing')
  return {
    schema: IMAGEGEN_STATUS_SCHEMA,
    ok: true,
    mode: config.mode,
    custom_model_enabled: config.mode === 'openrouter',
    openrouter_model: config.openrouter_model,
    openrouter_key_present: Boolean(key.key),
    effective: { provider: selection.mode, model: selection.model, label: selection.label },
    jev_enabled: jev,
    blockers: [] as string[],
    warnings,
    config_path: imagegenConfigPath(env),
    ...extra
  }
}

function print(payload: any, json: boolean): void {
  if (json) {
    printJson(payload)
    return
  }
  if (payload.schema === IMAGEGEN_STATUS_SCHEMA) {
    console.log(`Image generation: ${payload.effective?.label}`)
    if (payload.custom_model_enabled && !payload.openrouter_key_present) console.log('Warning: no OpenRouter key; add it in SKS Control Center (Connections, OpenRouter) or with `sks bridge provider configure openrouter --api-key-stdin`.')
    for (const warning of payload.warnings || []) if (warning !== 'openrouter_key_missing') console.log(`Warning: ${warning}`)
    for (const blocker of payload.blockers || []) console.log(`Blocked: ${blocker}`)
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

function readAll(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]!)
  return out
}

export async function run(_command: string, args: string[] = []): Promise<void> {
  const env = process.env
  const json = flag(args, '--json')
  const action = args.find((arg) => !arg.startsWith('-')) || 'status'
  if (flag(args, '--help') || flag(args, '-h')) {
    if (json) printJson({ ok: true, command: 'imagegen', usage: USAGE, mutated: false })
    else console.log(USAGE)
    return
  }

  if (action === 'status') {
    print(await statusPayload(await readImagegenConfig(env), env), json)
    return
  }

  if (action === 'models') {
    const list = await listOpenRouterImageModels({ env, refresh: flag(args, '--refresh') })
    const config = await readImagegenConfig(env)
    const payload = { ...list, models: list.models.map((model) => ({ ...model, selected: model.id === config.openrouter_model })) }
    if (json) printJson(payload)
    else for (const model of payload.models) console.log(`${model.selected ? '*' : ' '} ${model.id}  ${model.name}`)
    if (!list.ok) process.exitCode = 1
    return
  }

  if (action === 'enable') {
    const model = String(readOption(args, '--model', '') || '').trim()
    const before = await readImagegenConfig(env)
    const fail = async (blocker: string) => {
      print({ ...(await statusPayload(before, env)), ok: false, blockers: [blocker], changed: false }, json)
      process.exitCode = 1
    }
    if (!model) return fail('imagegen_model_required')
    if (!isOpenRouterModelId(model)) return fail('imagegen_model_not_image_capable')
    // Only a model OpenRouter lists with image output can be chosen.
    const list = await listOpenRouterImageModels({ env })
    if (!list.ok) return fail(list.blockers[0] || 'openrouter_models_unavailable')
    const row = list.models.find((candidate) => candidate.id === model)
    if (!row) return fail('imagegen_model_not_image_capable')
    const next = await writeImagegenConfig({ mode: 'openrouter', openrouterModel: model }, env)
    const payload = await statusPayload(next, env, { changed: before.mode !== next.mode || before.openrouter_model !== next.openrouter_model })
    // UX review callouts, slide callouts and edits send a reference image.
    if (row.max_references === 0) payload.warnings.push('imagegen_model_takes_no_reference_images')
    print(payload, json)
    return
  }

  if (action === 'disable') {
    const before = await readImagegenConfig(env)
    const next = await writeImagegenConfig({ mode: 'codex' }, env)
    print(await statusPayload(next, env, { changed: before.mode !== 'codex' }), json)
    return
  }

  if (action === 'generate') {
    const prompt = String(readOption(args, '--prompt', '') || '').trim()
    const out = String(readOption(args, '--out', '') || '').trim()
    if (!prompt || !out) {
      print({ schema: 'sks.imagegen-generate.v1', ok: false, blockers: [!prompt ? 'imagegen_prompt_required' : 'imagegen_out_required'], usage: USAGE }, json)
      process.exitCode = 1
      return
    }
    const references = readAll(args, '--reference').map((file) => path.resolve(file))
    const explicitAspect = readOption(args, '--aspect', null)
    const explicitQuality = readOption(args, '--quality', null)
    // Jev fills what the caller left open, so the model spends no turn on it.
    const jev = explicitAspect && explicitQuality
      ? null
      : await decideImagegenParameters({ root: process.cwd(), prompt, hasReference: references.length > 0, ask: { aspect: !explicitAspect, quality: !explicitQuality }, env }).catch(() => null)
    const result = await generateSksImage({
      prompt,
      outPath: path.resolve(out),
      references,
      aspectRatio: explicitAspect || jev?.aspectRatio || null,
      quality: explicitQuality || jev?.quality || null,
      env
    })
    print({ ...result, jev }, json)
    if (!result.ok) process.exitCode = 1
    return
  }

  print({ ok: false, blockers: [`imagegen_unknown_action:${action}`], usage: USAGE }, json)
  process.exitCode = 1
}
