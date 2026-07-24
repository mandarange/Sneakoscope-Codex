import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_ROOT = 'dist/scripts';
const BROAD_SCRIPT_EXCLUSION = '!dist/scripts/**';
const TEXT_EXTENSIONS = new Set(['.cjs', '.js', '.json', '.mjs', '.sh', '.swift', '.ts', '.yaml', '.yml']);

export interface RuntimeScriptPackClosureAnalysis {
  schema: 'sks.runtime-script-pack-closure.v1';
  root_mode: 'legacy_discovery' | 'manifest_ssot';
  candidates: string[];
  roots: string[];
  root_reasons: Array<{ path: string; sources: string[] }>;
  required_script_categories: Array<{ path: string; category: string; reason: string }>;
  reference_source_policies: Array<{ source: string; classification: string; reason: string }>;
  classified_reference_roots: Array<{ path: string; source: string; classification: string; reason: string }>;
  unclassified_reference_roots: Array<{ path: string; source: string }>;
  checkout_only_roots: string[];
  checkout_only_root_reasons: Array<{ path: string; sources: string[] }>;
  checkout_only_closure: string[];
  checkout_only_excluded: string[];
  checkout_only_policies: Array<{ path: string; sources: string[]; reason: string }>;
  closure: string[];
  excluded: string[];
  declared: string[];
  missing_from_allowlist: string[];
  stale_allowlist_entries: string[];
  missing_references: Array<{ source: string; reference: string }>;
  dynamic_reference_warnings: Array<{ source: string; excerpt: string }>;
  dynamic_reference_policies: Array<{ source: string; reason: string }>;
  uncovered_dynamic_references: Array<{ source: string; excerpt: string }>;
  stale_dynamic_reference_policies: Array<{ source: string; reason: string }>;
  declaration_issues: string[];
  closure_sha256: string;
}

export function analyzeRuntimeScriptPackClosure(root: string): RuntimeScriptPackClosureAnalysis {
  const absoluteRoot = path.resolve(root);
  const pkg = readJson(path.join(absoluteRoot, 'package.json')) as { files?: unknown; scripts?: unknown };
  const candidates = listFiles(path.join(absoluteRoot, SCRIPT_ROOT))
    .filter((file) => file.endsWith('.js'))
    .map((file) => repoRelative(absoluteRoot, file));
  const candidateSet = new Set(candidates);
  const roots = new Set<string>();
  const rootReasons = new Map<string, Set<string>>();
  const missingReferences = new Map<string, { source: string; reference: string }>();
  const dynamicWarnings = new Map<string, { source: string; excerpt: string }>();
  const checkoutOnlyPolicies: Array<{ path: string; sources: string[]; reason: string }> = [];
  const checkoutOnlyPolicyIssues: string[] = [];
  const manifestRoots = new Set<string>();
  const requiredScriptCategories: Array<{ path: string; category: string; reason: string }> = [];
  const referenceSourcePolicies: Array<{ source: string; classification: string; reason: string }> = [];
  let rootMode: RuntimeScriptPackClosureAnalysis['root_mode'] = 'legacy_discovery';

  const collectRoots = (source: string, text: string, context = source, strictExplicit = false) => {
    const scan = scanScriptReferences(text, runtimeContext(context), candidateSet, strictExplicit);
    for (const reference of scan.references) addRoot(roots, rootReasons, reference, source);
    recordMissing(missingReferences, source, scan.missing);
    recordDynamic(dynamicWarnings, runtimeContext(source), scan.dynamic);
  };

  collectRoots('package.json#scripts', JSON.stringify(pkg.scripts || {}), 'package.json', true);
  for (const manifest of ['release-gates.v2.json', 'infra-harness-gates.json']) {
    const absolute = path.join(absoluteRoot, manifest);
    if (fs.existsSync(absolute)) collectRoots(manifest, fs.readFileSync(absolute, 'utf8'), manifest, true);
  }

  const requiredManifestPath = path.join(absoluteRoot, 'runtime-required-scripts.json');
  let dynamicReferencePolicies: Array<{ source: string; reason: string }> = [];
  if (fs.existsSync(requiredManifestPath)) {
    const manifest = readJson(requiredManifestPath) as {
      root_mode?: unknown;
      scripts?: Array<{ path?: unknown; category?: unknown; reason?: unknown }>;
      reference_source_policies?: Array<{ source?: unknown; classification?: unknown; reason?: unknown }>;
      dynamic_reference_policies?: Array<{ source?: unknown; reason?: unknown }>;
      checkout_only_scripts?: Array<{ path?: unknown; sources?: unknown; reason?: unknown }>;
    };
    if (manifest.root_mode === 'manifest_ssot') rootMode = 'manifest_ssot';
    else if (manifest.root_mode !== undefined) checkoutOnlyPolicyIssues.push(`runtime_script_root_mode_invalid:${String(manifest.root_mode)}`);
    for (const entry of Array.isArray(manifest.scripts) ? manifest.scripts : []) {
      const reference = normalizeScriptPath(String(entry?.path || ''));
      const reason = String(entry?.reason || '').trim();
      const category = String(entry?.category || '').trim();
      if (reference && candidateSet.has(reference)) {
        manifestRoots.add(reference);
        addRoot(roots, rootReasons, reference, 'runtime-required-scripts.json');
      }
      else if (reference) missingReferences.set(`runtime-required-scripts.json\0${reference}`, {
        source: 'runtime-required-scripts.json', reference
      });
      if (!reference) checkoutOnlyPolicyIssues.push(`runtime_required_script_path_invalid:${String(entry?.path || '')}`);
      if (!reason) checkoutOnlyPolicyIssues.push(`runtime_required_script_reason_missing:${reference || 'invalid'}`);
      if (rootMode === 'manifest_ssot' && ![
        'installed_runtime',
        'installed_repair',
        'installed_package_verification'
      ].includes(category)) {
        checkoutOnlyPolicyIssues.push(`runtime_required_script_category_invalid:${reference || 'invalid'}:${category || 'missing'}`);
      }
      if (reference && reason && (rootMode !== 'manifest_ssot' || category)) {
        requiredScriptCategories.push({ path: reference, category: category || 'legacy_unspecified', reason });
      }
    }
    for (const entry of Array.isArray(manifest.reference_source_policies) ? manifest.reference_source_policies : []) {
      const source = String(entry?.source || '').trim().replace(/\\/g, '/');
      const classification = String(entry?.classification || '').trim();
      const reason = String(entry?.reason || '').trim();
      if (!source || source.includes('..')) checkoutOnlyPolicyIssues.push(`runtime_reference_source_policy_invalid:${source || 'missing'}`);
      if (!['installed_runtime', 'checkout_ci', 'test_fixture'].includes(classification)) {
        checkoutOnlyPolicyIssues.push(`runtime_reference_source_classification_invalid:${source || 'missing'}:${classification || 'missing'}`);
      }
      if (!reason) checkoutOnlyPolicyIssues.push(`runtime_reference_source_reason_missing:${source || 'missing'}`);
      if (source && !source.includes('..') && ['installed_runtime', 'checkout_ci', 'test_fixture'].includes(classification) && reason) {
        referenceSourcePolicies.push({ source, classification, reason });
      }
    }
    dynamicReferencePolicies = (Array.isArray(manifest.dynamic_reference_policies) ? manifest.dynamic_reference_policies : [])
      .map((entry) => ({ source: runtimeContext(String(entry?.source || '')), reason: String(entry?.reason || '').trim() }))
      .filter((entry) => entry.source && entry.reason)
      .sort((a, b) => a.source.localeCompare(b.source));
    for (const entry of Array.isArray(manifest.checkout_only_scripts) ? manifest.checkout_only_scripts : []) {
      const scriptPath = normalizeScriptPath(String(entry?.path || ''));
      const reason = String(entry?.reason || '').trim();
      const sources = Array.isArray(entry?.sources)
        ? [...new Set(entry.sources.map((source) => String(source || '').trim().replace(/\\/g, '/')).filter(Boolean))].sort()
        : [];
      if (!scriptPath) checkoutOnlyPolicyIssues.push(`checkout_only_script_path_invalid:${String(entry?.path || '')}`);
      else if (!candidateSet.has(scriptPath)) checkoutOnlyPolicyIssues.push(`checkout_only_script_missing:${scriptPath}`);
      if (!reason) checkoutOnlyPolicyIssues.push(`checkout_only_script_reason_missing:${scriptPath || 'invalid'}`);
      if (!sources.length) checkoutOnlyPolicyIssues.push(`checkout_only_script_sources_missing:${scriptPath || 'invalid'}`);
      for (const source of sources) {
        if (!/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(source)) {
          checkoutOnlyPolicyIssues.push(`checkout_only_script_source_invalid:${scriptPath || 'invalid'}:${source}`);
        }
      }
      if (scriptPath && candidateSet.has(scriptPath) && reason && sources.length) {
        checkoutOnlyPolicies.push({ path: scriptPath, sources, reason });
      }
    }
  }

  for (const relative of runtimeReferenceSources(absoluteRoot)) {
    const absolute = path.join(absoluteRoot, relative);
    collectRoots(relative, fs.readFileSync(absolute, 'utf8'), relative);
  }

  const edges = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const scan = scanScriptReferences(fs.readFileSync(path.join(absoluteRoot, candidate), 'utf8'), candidate, candidateSet);
    edges.set(candidate, new Set(scan.references));
    recordMissing(missingReferences, candidate, scan.missing);
    recordDynamic(dynamicWarnings, candidate, scan.dynamic);
  }

  const classifiedReferenceRoots: Array<{ path: string; source: string; classification: string; reason: string }> = [];
  const unclassifiedReferenceRoots: Array<{ path: string; source: string }> = [];
  const installedPolicyRoots = new Set<string>();
  if (rootMode === 'manifest_ssot') {
    for (const [scriptPath, sources] of rootReasons) {
      if (manifestRoots.has(scriptPath)) continue;
      for (const source of sources) {
        const policy = referenceSourcePolicies.find((entry) => sourcePolicyMatches(entry.source, source));
        if (policy) {
          if (policy.classification === 'installed_runtime') installedPolicyRoots.add(scriptPath);
          classifiedReferenceRoots.push({
            path: scriptPath,
            source,
            classification: policy.classification,
            reason: policy.reason
          });
        } else {
          unclassifiedReferenceRoots.push({ path: scriptPath, source });
          checkoutOnlyPolicyIssues.push(`runtime_reference_source_unclassified:${scriptPath}:${source}`);
        }
      }
    }
  }

  const packageRoots = rootMode === 'manifest_ssot'
    ? new Set([...manifestRoots, ...installedPolicyRoots])
    : new Set(roots);
  const checkoutOnlyRoots = new Set<string>();
  for (const policy of checkoutOnlyPolicies) {
    const observed = [...(rootReasons.get(policy.path) || [])].sort();
    const missingSources = policy.sources.filter((source) => !observed.includes(source));
    const unexpectedSources = observed.filter((source) => !policy.sources.includes(source));
    if (!observed.length) checkoutOnlyPolicyIssues.push(`checkout_only_script_policy_stale:${policy.path}`);
    for (const source of missingSources) {
      checkoutOnlyPolicyIssues.push(`checkout_only_script_source_not_observed:${policy.path}:${source}`);
    }
    for (const source of unexpectedSources) {
      checkoutOnlyPolicyIssues.push(`checkout_only_script_unapproved_root_source:${policy.path}:${source}`);
    }
    if (observed.length && missingSources.length === 0 && unexpectedSources.length === 0) {
      packageRoots.delete(policy.path);
      checkoutOnlyRoots.add(policy.path);
    }
  }

  const closure = transitiveClosure(packageRoots, edges);
  const checkoutOnlyClosure = transitiveClosure(checkoutOnlyRoots, edges);
  const declaredResult = declaredRuntimeScriptAllowlist(pkg.files);
  const declaredSet = new Set(declaredResult.declared);
  const closureSet = new Set(closure);
  const checkoutOnlyClosureSet = new Set(checkoutOnlyClosure);
  for (const [source, dependencies] of edges) {
    if (!closureSet.has(source) || checkoutOnlyClosureSet.has(source)) continue;
    for (const dependency of dependencies) {
      if (checkoutOnlyClosureSet.has(dependency)) {
        checkoutOnlyPolicyIssues.push(`checkout_only_script_product_dependency:${dependency}:${source}`);
      }
    }
  }
  const missingFromAllowlist = closure.filter((file) => !declaredSet.has(file));
  const staleAllowlistEntries = declaredResult.declared.filter((file) => !closureSet.has(file));
  const excluded = candidates.filter((file) => !closureSet.has(file));
  const dynamicReferenceWarnings = [...dynamicWarnings.values()].sort(compareFinding);
  const dynamicPolicySources = new Set(dynamicReferencePolicies.map((entry) => entry.source));
  const observedDynamicSources = new Set(dynamicReferenceWarnings.map((entry) => entry.source));

  return {
    schema: 'sks.runtime-script-pack-closure.v1',
    root_mode: rootMode,
    candidates,
    roots: [...packageRoots].sort(),
    root_reasons: [...rootReasons.entries()]
      .filter(([scriptPath]) => packageRoots.has(scriptPath))
      .map(([scriptPath, sources]) => ({ path: scriptPath, sources: [...sources].sort() }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    required_script_categories: requiredScriptCategories.sort((a, b) => a.path.localeCompare(b.path)),
    reference_source_policies: referenceSourcePolicies.sort((a, b) => a.source.localeCompare(b.source)),
    classified_reference_roots: classifiedReferenceRoots.sort(comparePolicyFinding),
    unclassified_reference_roots: unclassifiedReferenceRoots.sort(comparePolicyFinding),
    checkout_only_roots: [...checkoutOnlyRoots].sort(),
    checkout_only_root_reasons: [...rootReasons.entries()]
      .filter(([scriptPath]) => checkoutOnlyRoots.has(scriptPath))
      .map(([scriptPath, sources]) => ({ path: scriptPath, sources: [...sources].sort() }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    checkout_only_closure: checkoutOnlyClosure,
    checkout_only_excluded: checkoutOnlyClosure.filter((file) => !closureSet.has(file)),
    checkout_only_policies: checkoutOnlyPolicies.sort((a, b) => a.path.localeCompare(b.path)),
    closure,
    excluded,
    declared: declaredResult.declared,
    missing_from_allowlist: missingFromAllowlist,
    stale_allowlist_entries: staleAllowlistEntries,
    missing_references: [...missingReferences.values()].sort(compareFinding),
    dynamic_reference_warnings: dynamicReferenceWarnings,
    dynamic_reference_policies: dynamicReferencePolicies,
    uncovered_dynamic_references: dynamicReferenceWarnings.filter((entry) => !dynamicPolicySources.has(entry.source)),
    stale_dynamic_reference_policies: dynamicReferencePolicies.filter((entry) => !observedDynamicSources.has(entry.source)),
    declaration_issues: [...new Set([...declaredResult.issues, ...checkoutOnlyPolicyIssues])].sort(),
    closure_sha256: digestLines(closure)
  };
}

export function declaredRuntimeScriptAllowlist(files: unknown): { declared: string[]; issues: string[] } {
  if (!Array.isArray(files)) return { declared: [], issues: ['package_files_missing'] };
  const values = files.map((entry) => String(entry));
  const exclusionIndexes = values
    .map((entry, index) => entry === BROAD_SCRIPT_EXCLUSION ? index : -1)
    .filter((index) => index >= 0);
  const issues: string[] = [];
  if (exclusionIndexes.length !== 1) issues.push(`broad_script_exclusion_count:${exclusionIndexes.length}`);
  const exclusionIndex = exclusionIndexes[0] ?? -1;
  const declared = new Set<string>();

  for (let index = 0; index < values.length; index += 1) {
    const entry = values[index]!;
    if (entry === BROAD_SCRIPT_EXCLUSION || !entry.includes('dist/scripts')) continue;
    if (entry.startsWith('!')) {
      issues.push(`specific_script_exclusion_forbidden:${entry}`);
      continue;
    }
    if (index < exclusionIndex) issues.push(`script_allowlist_before_exclusion:${entry}`);
    const brace = entry.match(/^dist\/scripts\/\{([^{}]+)\}$/);
    if (brace) {
      for (const name of brace[1]!.split(',')) addDeclared(declared, name, issues, entry);
      continue;
    }
    const exact = entry.match(/^dist\/scripts\/(.+\.js)$/);
    if (exact && !/[?*\[\]]/.test(exact[1]!)) {
      addDeclared(declared, exact[1]!, issues, entry);
      continue;
    }
    issues.push(`unsupported_script_allowlist_pattern:${entry}`);
  }
  return { declared: [...declared].sort(), issues: [...new Set(issues)].sort() };
}

export function formatRuntimeScriptAllowlist(closure: readonly string[], chunkSize = 100): string[] {
  const names = [...new Set(closure)]
    .map((file) => normalizeScriptPath(file))
    .filter((file): file is string => Boolean(file))
    .map((file) => file.slice(`${SCRIPT_ROOT}/`.length))
    .sort();
  const patterns: string[] = [BROAD_SCRIPT_EXCLUSION];
  for (let index = 0; index < names.length; index += chunkSize) {
    patterns.push(`dist/scripts/{${names.slice(index, index + chunkSize).join(',')}}`);
  }
  return patterns;
}

function runtimeReferenceSources(root: string): string[] {
  const sources = new Set<string>();
  for (const base of ['.github/workflows', 'native', 'scripts', 'src', 'dist']) {
    const absoluteBase = path.join(root, base);
    for (const absolute of listFiles(absoluteBase)) {
      const relative = repoRelative(root, absolute);
      if (!isTextFile(relative)) continue;
      if (relative.startsWith(`${SCRIPT_ROOT}/`)) continue;
      if (relative.startsWith('src/scripts/')) continue;
      if (/^dist\/[^/]+\.json$/.test(relative)) continue;
      if (/(^|\/)__tests__\//.test(relative) || /\.test\.[cm]?[jt]s$/.test(relative)) continue;
      if (/\.(?:map|d\.ts)$/.test(relative)) continue;
      sources.add(relative);
    }
  }
  return [...sources].sort();
}

function scanScriptReferences(text: string, context: string, candidates: ReadonlySet<string>, strictExplicit = false): {
  references: string[];
  missing: string[];
  dynamic: string[];
} {
  const references = new Set<string>();
  const missing = new Set<string>();
  considerReference(text, context, candidates, references, missing, false, false, strictExplicit);
  for (const literal of stringLiterals(text)) {
    considerReference(literal, context, candidates, references, missing, false, false, strictExplicit);
  }
  for (const specifier of moduleSpecifiers(text)) {
    considerReference(specifier, context, candidates, references, missing, true, false, true);
  }
  const namedScriptCall = /\b(?:nodeScript|scriptPath|resolveScript|spawnNodeScript)\s*\(([^)]{1,300})\)/g;
  for (const match of text.matchAll(namedScriptCall)) {
    const [first] = stringLiterals(match[1]!);
    if (first) considerReference(first, context, candidates, references, missing, true, true, true);
  }
  const callPattern = /(?:\bpath\s*\.\s*)?(?:join|resolve)\s*\(([^)]{1,800})\)/g;
  for (const match of text.matchAll(callPattern)) {
    const parts = stringLiterals(match[1]!);
    if (parts.length) considerReference(parts.join('/'), context, candidates, references, missing, false, false, true);
  }
  const dynamic = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length <= 500)
    .filter((line) => /`[^`\r\n]*dist[\\/]scripts[\\/][^\s`\r\n]{0,120}\$\{[^}]+\}/.test(line)
      || /['"][^'"\r\n]*dist[\\/]scripts[\\/][^'"\r\n]*['"]\s*\+/.test(line))
    .slice(0, 32);
  return { references: [...references].sort(), missing: [...missing].sort(), dynamic };
}

function considerReference(
  raw: string,
  context: string,
  candidates: ReadonlySet<string>,
  references: Set<string>,
  missing: Set<string>,
  allowRelative: boolean,
  allowBare: boolean,
  reportMissing: boolean
): void {
  const value = raw.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0] ?? '';
  for (const match of value.matchAll(/(?:^|[^A-Za-z0-9_.-])((?:\.\/)?dist\/scripts\/[A-Za-z0-9._/-]+\.js)(?=$|[^A-Za-z0-9_.-])/g)) {
    recordResolved(normalizeScriptPath(match[1]!), candidates, references, missing, reportMissing);
  }
  if (!value.endsWith('.js')) return;
  const marker = value.lastIndexOf(`${SCRIPT_ROOT}/`);
  let resolved: string | null = marker >= 0 ? normalizeScriptPath(value.slice(marker)) : null;
  if (!resolved && value.startsWith('scripts/')) resolved = normalizeScriptPath(`dist/${value}`);
  if (!resolved && context.startsWith('dist/')) {
    const relative = allowRelative && value.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(context), value))
      : allowBare && context.startsWith(`${SCRIPT_ROOT}/`) && !value.includes('/')
        ? path.posix.join(path.posix.dirname(context), value)
        : null;
    if (relative?.startsWith(`${SCRIPT_ROOT}/`)) resolved = normalizeScriptPath(relative);
  }
  recordResolved(resolved, candidates, references, missing, reportMissing);
}

function recordResolved(
  resolved: string | null,
  candidates: ReadonlySet<string>,
  references: Set<string>,
  missing: Set<string>,
  reportMissing: boolean
): void {
  if (!resolved) return;
  if (candidates.has(resolved)) references.add(resolved);
  else if (reportMissing) missing.add(resolved);
}

function moduleSpecifiers(text: string): string[] {
  const values: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\/\//.test(line)) continue;
    const staticMatch = line.match(/^\s*(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?(['"`])([^'"`]+)\1/);
    if (staticMatch?.[2]) values.push(decodeLiteral(staticMatch[2]));
    const dynamicIndex = line.search(/\b(?:import|require)\s*\(/);
    if (dynamicIndex >= 0 && !/['"`]/.test(line.slice(0, dynamicIndex))) {
      const dynamicMatch = line.slice(dynamicIndex).match(/\b(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1/);
      if (dynamicMatch?.[2]) values.push(decodeLiteral(dynamicMatch[2]));
    }
    const urlIndex = line.search(/\bnew\s+URL\s*\(/);
    if (urlIndex >= 0 && !/['"`]/.test(line.slice(0, urlIndex))) {
      const urlMatch = line.slice(urlIndex).match(/\bnew\s+URL\s*\(\s*(['"`])([^'"`]+)\1/);
      if (urlMatch?.[2]) values.push(decodeLiteral(urlMatch[2]));
    }
  }
  return values;
}

function stringLiterals(text: string): string[] {
  const values: string[] = [];
  for (const pattern of [/'((?:\\.|[^'\\])*)'/g, /"((?:\\.|[^"\\])*)"/g, /`((?:\\.|[^`\\$]|\$(?!\{))*)`/g]) {
    for (const match of text.matchAll(pattern)) values.push(decodeLiteral(match[1]!));
  }
  return values;
}

function decodeLiteral(value: string): string {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\')
    .replace(/\\(['"`])/g, '$1');
}

function transitiveClosure(roots: ReadonlySet<string>, edges: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const visited = new Set<string>();
  const queue = [...roots].sort();
  while (queue.length) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dependency of edges.get(current) || []) if (!visited.has(dependency)) queue.push(dependency);
    queue.sort();
  }
  return [...visited].sort();
}

function addDeclared(target: Set<string>, name: string, issues: string[], source: string): void {
  const normalized = normalizeScriptPath(`${SCRIPT_ROOT}/${name.trim()}`);
  if (!normalized || !normalized.endsWith('.js')) issues.push(`invalid_script_allowlist_entry:${source}:${name}`);
  else target.add(normalized);
}

function normalizeScriptPath(value: string): string | null {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/^\.\//, ''));
  if (!/^dist\/scripts\/(?:[A-Za-z0-9_][A-Za-z0-9._-]*\/)*[A-Za-z0-9_][A-Za-z0-9._-]*\.js$/.test(normalized)) return null;
  return normalized;
}

function runtimeContext(relative: string): string {
  const normalized = relative.replace(/\\/g, '/');
  if (!normalized.startsWith('src/')) return normalized;
  return `dist/${normalized.slice(4).replace(/\.(?:mts|cts|ts)$/, '.js')}`;
}

function listFiles(base: string): string[] {
  if (!fs.existsSync(base)) return [];
  const output: string[] = [];
  const stack = [base];
  while (stack.length) {
    const current = stack.pop() as string;
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      output.push(current);
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return output.sort();
}

function isTextFile(relative: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase());
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repoRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function recordMissing(target: Map<string, { source: string; reference: string }>, source: string, values: readonly string[]): void {
  for (const reference of values) target.set(`${source}\0${reference}`, { source, reference });
}

function recordDynamic(target: Map<string, { source: string; excerpt: string }>, source: string, values: readonly string[]): void {
  for (const excerpt of values) target.set(`${source}\0${excerpt}`, { source, excerpt });
}

function addRoot(target: Set<string>, reasons: Map<string, Set<string>>, scriptPath: string, source: string): void {
  target.add(scriptPath);
  const current = reasons.get(scriptPath) || new Set<string>();
  current.add(source);
  reasons.set(scriptPath, current);
}

function sourcePolicyMatches(pattern: string, source: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const expression = escaped
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');
  return new RegExp(`^${expression}$`).test(source);
}

function comparePolicyFinding(
  a: { path: string; source: string },
  b: { path: string; source: string }
): number {
  return `${a.path}\0${a.source}`.localeCompare(`${b.path}\0${b.source}`);
}

function compareFinding(a: { source: string; reference?: string; excerpt?: string }, b: { source: string; reference?: string; excerpt?: string }): number {
  return `${a.source}\0${a.reference || a.excerpt || ''}`.localeCompare(`${b.source}\0${b.reference || b.excerpt || ''}`);
}

function digestLines(lines: readonly string[]): string {
  return crypto.createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
}
