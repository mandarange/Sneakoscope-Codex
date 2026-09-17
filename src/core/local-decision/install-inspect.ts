export const HF_API_BASE = 'https://huggingface.co'
/**
 * Weights repository the requested engine's model card names for its own
 * benchmarks. Offered to the user as the default choice in the CLI help and
 * the Control Center; never applied without an explicit install request.
 */
export const RECOMMENDED_WEIGHTS_MODEL_ID = 'mlx-community/Qwen2.5-1.5B-Instruct-4bit'
export const RECOMMENDED_WEIGHTS_SOURCE = 'named_by_model_card_of:harshatheg/Qwen-2.5-1B-RLCD'
export const COMMIT_SHA_RE = /^[0-9a-f]{40}$/
export const SUPPORTED_MODEL_TYPES = Object.freeze(['qwen2'])
/** CPython minor pinned by requirements.lock (macOS arm64 wheels). */
export const SUPPORTED_PYTHON_MINOR = '3.12'
export const PYTHON_CANDIDATES = Object.freeze(['python3.12', '/opt/homebrew/bin/python3.12', '/usr/local/bin/python3.12'])
export const TOKENIZER_FILES = Object.freeze([
  'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt',
  'special_tokens_map.json', 'added_tokens.json', 'chat_template.jinja'
])
export const CONFIG_FILES = Object.freeze(['config.json', 'generation_config.json'])
export const LICENSE_FILES = Object.freeze(['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'README.md'])

/**
 * Audited upstream engine reference. Its source was read at this immutable
 * revision as design evidence (Apache-2.0); nothing from it is executed.
 */
export const UPSTREAM_ENGINE_REFERENCE = Object.freeze({
  repoId: 'harshatheg/Qwen-2.5-1B-RLCD',
  revision: '2af86848be75847ccb3553b0941cc51d6ef7e4e9',
  license: 'apache-2.0',
  sourceDigests: Object.freeze({
    'core/engine.py': '147e4a53890657adee6f6389ccdd816140bcccbc32beaa8ddd3e30493246dfe1',
    'core/engine_mlx.py': '9429d1f3df66133c5b6675c8295680a6302c366f364a2f2e9e6365157df993b2',
    'core/schema.py': '5fdfa2ffe4fd83c64e98331802d4a0f0858aa85197380cfc1ff6a39100f73232',
    'core/prompt_builder.py': '84d8d7dc88d64212df22dfe7a269b0d28b1fa4d1aa36ca740ef18a70419e6aac',
    'core/__init__.py': '761f67d16ad5d77d62914846c1cb66483445c7d7aed19e7413d975368941e255',
    'core/benchmark.py': '93c779f04abe8d8db3cc618f6c5d9d8d6f3d69cf6fdb6eeffb8e19c738a4ab84',
    'MODEL_CARD.md': '7589906e2c31b2c63d2065e5efa074ab0de58167a9095609c2b225085f65cde7'
  })
})

export class InstallError extends Error {
  readonly code: string
  readonly detail: Record<string, unknown>
  constructor(code: string, detail: Record<string, unknown> = {}) {
    super(code)
    this.name = 'InstallError'
    this.code = code
    this.detail = detail
  }
}

export interface HfSibling { name: string; size: number | null; sha256: string | null }

export interface InspectResult {
  schema: 'sks.local-decision-inspect.v1'
  ok: boolean
  modelId: string
  requestedRevision: string | null
  resolvedRevision: string | null
  lastModified: string | null
  gated: boolean
  private: boolean
  license: string | null
  licenseLink: string | null
  baseModel: string | null
  kind: 'weights' | 'engine_source' | 'unknown'
  compatible: boolean
  blockers: string[]
  notes: string[]
  files: HfSibling[]
  totalBytes: number
  downloadBytes: number
  config: { modelType: string | null; architectures: string[]; quantization: string; maxPositionEmbeddings: number | null } | null
  /** Repo ids the model card itself names; never applied automatically. */
  cardMentionedRepos: string[]
  installCommand: string | null
}

export interface InspectDeps {
  fetchJson?: (url: string) => Promise<unknown>
  fetchText?: (url: string) => Promise<string | null>
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new InstallError('hf_api_error', { url, status: response.status })
  return response.json()
}

async function defaultFetchText(url: string): Promise<string | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.text()
}

export function quantizationLabel(config: any): string {
  const quant = config?.quantization
  if (quant && typeof quant === 'object' && Number.isInteger(quant.bits)) {
    return `${quant.bits}bit-g${Number.isInteger(quant.group_size) ? quant.group_size : '?'}`
  }
  return 'none'
}

export function classifyRepo(files: HfSibling[]): 'weights' | 'engine_source' | 'unknown' {
  const names = new Set(files.map((file) => file.name))
  const hasWeights = files.some((file) => file.name.endsWith('.safetensors'))
  if (hasWeights && names.has('config.json')) return 'weights'
  if (files.some((file) => file.name.endsWith('.py')) && !hasWeights) return 'engine_source'
  return 'unknown'
}

export function installCommandFor(modelId: string, revision: string): string {
  return `sks decision install --model ${modelId} --revision ${revision} --accept-license --yes --json`
}

/** Online metadata only: never downloads weights. */
export async function inspectLocalDecisionModel(modelId: string, options: { revision?: string | null; deps?: InspectDeps } = {}): Promise<InspectResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(modelId)) throw new InstallError('invalid_model_id', { modelId })
  const revision = options.revision ? String(options.revision) : null
  if (revision !== null && !COMMIT_SHA_RE.test(revision)) throw new InstallError('revision_must_be_commit_sha', { revision })
  const fetchJson = options.deps?.fetchJson || defaultFetchJson
  const fetchText = options.deps?.fetchText || defaultFetchText
  const infoUrl = revision
    ? `${HF_API_BASE}/api/models/${modelId}/revision/${revision}?blobs=true`
    : `${HF_API_BASE}/api/models/${modelId}?blobs=true`
  const info: any = await fetchJson(infoUrl)
  const files: HfSibling[] = Array.isArray(info?.siblings)
    ? info.siblings.map((row: any) => ({
        name: String(row.rfilename || ''),
        size: Number.isFinite(row.size) ? Number(row.size) : null,
        sha256: typeof row.lfs?.sha256 === 'string' ? row.lfs.sha256 : null
      })).filter((row: HfSibling) => row.name)
    : []
  const kind = classifyRepo(files)
  const resolvedRevision = typeof info?.sha === 'string' && COMMIT_SHA_RE.test(info.sha) ? info.sha : null
  const blockers: string[] = []
  const notes: string[] = []
  let config: InspectResult['config'] = null
  if (kind === 'weights') {
    const raw = await fetchText(`${HF_API_BASE}/${modelId}/resolve/${revision || resolvedRevision || 'main'}/config.json`)
    try {
      const parsed = raw ? JSON.parse(raw) : null
      config = parsed ? {
        modelType: typeof parsed.model_type === 'string' ? parsed.model_type : null,
        architectures: Array.isArray(parsed.architectures) ? parsed.architectures.map(String) : [],
        quantization: quantizationLabel(parsed),
        maxPositionEmbeddings: Number.isInteger(parsed.max_position_embeddings) ? parsed.max_position_embeddings : null
      } : null
    } catch {
      config = null
    }
    if (!config) blockers.push('config_json_unreadable')
    else if (!config.modelType || !SUPPORTED_MODEL_TYPES.includes(config.modelType)) blockers.push(`unsupported_model_type:${config.modelType ?? 'unknown'}`)
    if (!files.some((file) => file.name === 'tokenizer.json')) blockers.push('tokenizer_json_missing')
    if (config && config.quantization === 'none') notes.push('unquantized_weights_larger_memory_footprint')
  } else if (kind === 'engine_source') {
    blockers.push('no_weights_in_repository')
    notes.push('repository_contains_engine_source_not_model_weights')
  } else {
    blockers.push('repository_kind_unknown')
  }
  if (info?.gated) blockers.push('gated_repository_requires_manual_access')
  if (!resolvedRevision) blockers.push('resolved_revision_unavailable')
  const cardMentionedRepos = new Set<string>()
  const readme = kind === 'engine_source' || kind === 'unknown'
    ? await fetchText(`${HF_API_BASE}/${modelId}/resolve/${revision || resolvedRevision || 'main'}/README.md`).catch(() => null)
    : null
  for (const match of String(readme || '').matchAll(/\b(mlx-community\/[A-Za-z0-9._-]+)\b/g)) cardMentionedRepos.add(match[1]!)
  const downloadBytes = files
    .filter((file) => file.name.endsWith('.safetensors') || file.name.endsWith('.safetensors.index.json') || TOKENIZER_FILES.includes(file.name) || CONFIG_FILES.includes(file.name) || LICENSE_FILES.includes(file.name))
    .reduce((total, file) => total + (file.size || 0), 0)
  const compatible = blockers.length === 0
  return {
    schema: 'sks.local-decision-inspect.v1',
    ok: compatible,
    modelId,
    requestedRevision: revision,
    resolvedRevision,
    lastModified: typeof info?.lastModified === 'string' ? info.lastModified : null,
    gated: Boolean(info?.gated),
    private: Boolean(info?.private),
    license: typeof info?.cardData?.license === 'string' ? info.cardData.license : null,
    licenseLink: typeof info?.cardData?.license_link === 'string' ? info.cardData.license_link : null,
    baseModel: typeof info?.cardData?.base_model === 'string' ? info.cardData.base_model : null,
    kind,
    compatible,
    blockers,
    notes,
    files,
    totalBytes: files.reduce((total, file) => total + (file.size || 0), 0),
    downloadBytes,
    config,
    cardMentionedRepos: [...cardMentionedRepos].sort(),
    installCommand: compatible && resolvedRevision ? installCommandFor(modelId, revision || resolvedRevision) : null
  }
}

