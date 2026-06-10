export interface ReleaseCacheInputChangeClassification {
  neutralizable: boolean
  reason: string
  behavior_affecting: boolean
}

export function classifyReleaseCacheInputChange(input: {
  file: string
  before: string
  after: string
}): ReleaseCacheInputChangeClassification {
  if (input.before === input.after) {
    return { neutralizable: true, reason: 'unchanged', behavior_affecting: false }
  }
  const before = normalizeReleaseCacheInputForBehavior(input.file, input.before)
  const after = normalizeReleaseCacheInputForBehavior(input.file, input.after)
  if (before === after) {
    return {
      neutralizable: true,
      reason: neutralReason(input.file),
      behavior_affecting: false
    }
  }
  return {
    neutralizable: false,
    reason: behaviorReason(input.file, input.before, input.after),
    behavior_affecting: true
  }
}

export function normalizeReleaseCacheInputForBehavior(file: string, text: string): string {
  const rel = normalizeRel(file)
  if (rel === 'package.json') return normalizePackageJson(text)
  if (rel === 'package-lock.json') return normalizePackageLock(text)
  if (rel === 'src/core/version.ts' || rel === 'src/core/fsx.ts') {
    return text.replace(/(PACKAGE_VERSION\s*=\s*['"])([^'"]+)(['"])/, '$1__SKS_RELEASE_VERSION__$3')
  }
  if (rel === 'src/bin/sks.ts') {
    return text.replace(/(FAST_PACKAGE_VERSION\s*=\s*['"])([^'"]+)(['"])/, '$1__SKS_RELEASE_VERSION__$3')
  }
  if (rel === 'dist/build-manifest.json') return normalizeBuildManifest(text)
  return text
}

function normalizePackageJson(text: string): string {
  return normalizeJson(text, (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      value.version = '__SKS_RELEASE_VERSION__'
    }
    return value
  })
}

function normalizePackageLock(text: string): string {
  return normalizeJson(text, (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      value.version = '__SKS_RELEASE_VERSION__'
      if (value.packages?.[''] && typeof value.packages[''] === 'object') {
        value.packages[''].version = '__SKS_RELEASE_VERSION__'
      }
    }
    return value
  })
}

function normalizeBuildManifest(text: string): string {
  return normalizeJson(text, (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('version' in value) value.version = '__SKS_RELEASE_VERSION__'
      if ('package_version' in value) value.package_version = '__SKS_RELEASE_VERSION__'
    }
    return value
  })
}

function normalizeJson(text: string, mutate: (value: any) => any): string {
  try {
    const parsed = JSON.parse(text)
    return stableJson(mutate(parsed))
  } catch {
    return text
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function neutralReason(file: string): string {
  const rel = normalizeRel(file)
  if (rel === 'package.json') return 'package_json_version_only'
  if (rel === 'package-lock.json') return 'package_lock_root_version_only'
  if (rel === 'src/bin/sks.ts') return 'fast_package_version_only'
  if (rel === 'src/core/version.ts' || rel === 'src/core/fsx.ts') return 'package_version_constant_only'
  if (rel === 'dist/build-manifest.json') return 'build_manifest_version_only'
  return 'version_surface_only'
}

function behaviorReason(file: string, before: string, after: string): string {
  const rel = normalizeRel(file)
  if (rel === 'package.json') {
    const changed = changedTopLevelJsonKeys(before, after)
    const behaviorKeys = changed.filter((key) => ['scripts', 'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'files', 'engines', 'publishConfig'].includes(key))
    return behaviorKeys.length ? `package_json_behavior_keys:${behaviorKeys.join(',')}` : `package_json_non_version_keys:${changed.join(',') || 'unknown'}`
  }
  if (rel === 'package-lock.json') return 'package_lock_dependency_graph_changed'
  if (rel === 'dist/build-manifest.json') return 'build_manifest_artifact_hash_or_behavior_changed'
  if (rel.startsWith('src/')) return 'source_behavior_changed'
  if (rel.startsWith('schemas/')) return 'schema_behavior_changed'
  return 'release_cache_input_behavior_changed'
}

function changedTopLevelJsonKeys(before: string, after: string): string[] {
  try {
    const left = JSON.parse(before)
    const right = JSON.parse(after)
    const keys = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])]
    return keys.filter((key) => stableJson(left?.[key]) !== stableJson(right?.[key])).sort()
  } catch {
    return []
  }
}

function normalizeRel(file: string): string {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\//, '')
}
