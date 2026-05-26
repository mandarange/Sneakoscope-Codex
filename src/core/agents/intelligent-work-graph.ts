import path from 'node:path'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export const INTELLIGENT_WORK_GRAPH_SCHEMA = 'sks.intelligent-work-graph.v1'

export interface IntelligentWorkGraph {
  schema: typeof INTELLIGENT_WORK_GRAPH_SCHEMA
  generated_at: string
  ok: boolean
  mode: 'advanced'
  source_inventory_count: number
  test_inventory_count: number
  docs_inventory_count: number
  script_schema_inventory_count: number
  dependency_edge_count: number
  test_ownership_map: any
  source_to_test_relations: any[]
  changed_file_candidates: string[]
  route_domain_priority: any[]
  critical_path: any
  integration_bottlenecks: any
  parallelizable_groups: any[]
  serial_dependency_groups: any[]
  work_graph_quality_score: number
  warnings: string[]
  blockers: string[]
}

export async function buildIntelligentWorkGraph(input: {
  root: string
  inventory: any
  dependencyGraph: any
  route?: string
  prompt?: string
}) {
  const changedFiles = await changedFilesForRoot(input.root)
  return buildIntelligentWorkGraphFromData({
    inventory: input.inventory,
    dependencyGraph: input.dependencyGraph,
    route: input.route || '$Agent',
    prompt: input.prompt || '',
    changedFiles
  })
}

export function buildIntelligentWorkGraphFromData(input: {
  inventory: any
  dependencyGraph: any
  route?: string
  prompt?: string
  changedFiles?: string[]
}): IntelligentWorkGraph {
  const inventory = input.inventory || {}
  const sourceFiles: string[] = Array.isArray(inventory.source_files) ? inventory.source_files : []
  const testFiles: string[] = Array.isArray(inventory.tests) ? inventory.tests : []
  const docs: string[] = Array.isArray(inventory.docs) ? inventory.docs : []
  const scripts: string[] = [...(Array.isArray(inventory.scripts) ? inventory.scripts : []), ...(Array.isArray(inventory.schemas) ? inventory.schemas : [])]
  const edges = Array.isArray(input.dependencyGraph?.edges) ? input.dependencyGraph.edges : []
  const ownership = buildTestOwnershipMap(sourceFiles, testFiles)
  const criticalPath = buildCriticalPath(sourceFiles, edges)
  const bottlenecks = buildIntegrationBottlenecks(edges, input.changedFiles || [])
  const priorities = buildRouteDomainPriority({ route: input.route || '$Agent', prompt: input.prompt || '', sourceFiles, docs, scripts, changedFiles: input.changedFiles || [] })
  const warnings = [
    ...ownership.unmapped_sources.slice(0, 50).map((file: string) => `source_without_test_mapping:${file}`),
    ...(input.changedFiles || []).filter((file) => !ownership.owner_by_source[file] && /^src\//.test(file)).map((file) => `changed_file_without_owner:${file}`),
    ...(criticalPath.path.length > 0 && priorities.length > 0 && (priorities[0]?.priority ?? 0) < 50 ? ['critical_path_low_priority_warning'] : [])
  ]
  const score = qualityScore({ sourceFiles, testFiles, ownership, criticalPath, bottlenecks, priorities })
  return {
    schema: INTELLIGENT_WORK_GRAPH_SCHEMA,
    generated_at: nowIso(),
    ok: score >= 0.55,
    mode: 'advanced',
    source_inventory_count: sourceFiles.length,
    test_inventory_count: testFiles.length,
    docs_inventory_count: docs.length,
    script_schema_inventory_count: scripts.length,
    dependency_edge_count: edges.reduce((sum: number, edge: any) => sum + (Array.isArray(edge.imports) ? edge.imports.length : 0), 0),
    test_ownership_map: ownership,
    source_to_test_relations: ownership.relations,
    changed_file_candidates: input.changedFiles || [],
    route_domain_priority: priorities,
    critical_path: criticalPath,
    integration_bottlenecks: bottlenecks,
    parallelizable_groups: buildParallelGroups(sourceFiles, testFiles, docs, scripts),
    serial_dependency_groups: criticalPath.path.length ? [{ group_id: 'critical-path', files: criticalPath.path, reason: 'longest import chain' }] : [],
    work_graph_quality_score: score,
    warnings,
    blockers: score < 0.35 ? ['work_graph_quality_too_low'] : []
  }
}

export function enhanceTaskGraphWithIntelligence(taskGraph: any, graph: IntelligentWorkGraph) {
  if (!taskGraph || !Array.isArray(taskGraph.work_items)) return taskGraph
  const bottleneckTargets = new Set((graph.integration_bottlenecks?.bottlenecks || []).map((row: any) => String(row.file)))
  const criticalTargets = new Set(graph.critical_path?.path || [])
  const workItems = taskGraph.work_items.map((item: any, index: number) => {
    const targets = Array.isArray(item.target_paths) ? item.target_paths.map(String) : []
    const critical = targets.some((file: string) => criticalTargets.has(file))
    const bottleneck = targets.some((file: string) => bottleneckTargets.has(file))
    const domain = graph.route_domain_priority[index % Math.max(1, graph.route_domain_priority.length)]
    return {
      ...item,
      priority: critical ? 1 : bottleneck ? Math.max(2, Number(item.priority || index + 1)) : Number(item.priority || index + 1),
      required_persona_category: bottleneck ? 'integrator' : item.required_persona_category || domain?.persona || 'verifier',
      intelligent_work_graph_ref: 'agent-intelligent-work-graph.json',
      test_ownership_ref: 'agent-test-ownership-map.json',
      critical_path_ref: 'agent-critical-path.json',
      integration_bottleneck_ref: 'agent-integration-bottlenecks.json'
    }
  })
  return {
    ...taskGraph,
    advanced_graph_mode: INTELLIGENT_WORK_GRAPH_SCHEMA,
    work_graph_quality_score: graph.work_graph_quality_score,
    intelligent_work_graph_ref: 'agent-intelligent-work-graph.json',
    test_ownership_map_ref: 'agent-test-ownership-map.json',
    critical_path_ref: 'agent-critical-path.json',
    integration_bottleneck_ref: 'agent-integration-bottlenecks.json',
    work_items: workItems
  }
}

export async function writeIntelligentWorkGraphArtifacts(root: string, graph: IntelligentWorkGraph) {
  await writeJsonAtomic(path.join(root, 'agent-intelligent-work-graph.json'), graph)
  await writeJsonAtomic(path.join(root, 'agent-test-ownership-map.json'), {
    schema: 'sks.agent-test-ownership-map.v1',
    generated_at: graph.generated_at,
    ok: graph.test_ownership_map.unmapped_sources.length < Math.max(10, graph.source_inventory_count),
    ...graph.test_ownership_map
  })
  await writeJsonAtomic(path.join(root, 'agent-critical-path.json'), {
    schema: 'sks.agent-critical-path.v1',
    generated_at: graph.generated_at,
    ok: graph.critical_path.path.length > 0,
    ...graph.critical_path
  })
  await writeJsonAtomic(path.join(root, 'agent-integration-bottlenecks.json'), {
    schema: 'sks.agent-integration-bottlenecks.v1',
    generated_at: graph.generated_at,
    ok: true,
    ...graph.integration_bottlenecks
  })
}

function buildTestOwnershipMap(sourceFiles: string[], testFiles: string[]) {
  const ownerBySource: Record<string, string[]> = {}
  const relations: any[] = []
  for (const source of sourceFiles) {
    const base = basenameNoExt(source)
    const hinted = testFiles.filter((test) => test.includes(base) || test.includes(source.replace(/^src\//, '').replace(/\.[^.]+$/, '')))
    ownerBySource[source] = hinted
    for (const test of hinted) relations.push({ source, test, confidence: test.includes(base) ? 'high' : 'medium' })
  }
  return {
    owner_by_source: ownerBySource,
    mapped_source_count: Object.values(ownerBySource).filter((rows) => rows.length > 0).length,
    unmapped_sources: Object.entries(ownerBySource).filter(([, rows]) => rows.length === 0).map(([source]) => source),
    relations
  }
}

function buildCriticalPath(sourceFiles: string[], edges: any[]) {
  const graph = new Map<string, string[]>()
  for (const file of sourceFiles) graph.set(file, [])
  for (const edge of edges) {
    if (!sourceFiles.includes(String(edge.from))) continue
    graph.set(String(edge.from), (Array.isArray(edge.imports) ? edge.imports : []).filter((file: string) => sourceFiles.includes(file)).slice(0, 50))
  }
  const memo = new Map<string, string[]>()
  const visiting = new Set<string>()
  const dfs = (node: string): string[] => {
    if (memo.has(node)) return memo.get(node) || [node]
    if (visiting.has(node)) return [node]
    visiting.add(node)
    let best = [node]
    for (const next of graph.get(node) || []) {
      const path = [node, ...dfs(next)]
      if (path.length > best.length) best = path
    }
    visiting.delete(node)
    memo.set(node, best)
    return best
  }
  let best: string[] = []
  for (const node of [...graph.keys()].slice(0, 2000)) {
    const candidate = dfs(node)
    if (candidate.length > best.length) best = candidate
  }
  return { path: best, length: best.length, root: best[0] || null, leaf: best[best.length - 1] || null }
}

function buildIntegrationBottlenecks(edges: any[], changedFiles: string[]) {
  const indegree = new Map<string, number>()
  for (const edge of edges) {
    for (const imported of Array.isArray(edge.imports) ? edge.imports : []) indegree.set(String(imported), (indegree.get(String(imported)) || 0) + 1)
  }
  const bottlenecks = [...indegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, inbound]) => ({ file, inbound_imports: inbound, changed: changedFiles.includes(file) }))
  return { bottlenecks, changed_bottlenecks: bottlenecks.filter((row) => row.changed) }
}

function buildRouteDomainPriority(input: { route: string; prompt: string; sourceFiles: string[]; docs: string[]; scripts: string[]; changedFiles: string[] }) {
  const domains = [
    domain('runtime', input.sourceFiles.filter((file) => file.startsWith('src/core/agents/') || file.startsWith('src/core/proof/')), 'integrator'),
    domain('cli', input.sourceFiles.filter((file) => file.startsWith('src/cli/') || file.startsWith('src/core/commands/')), 'implementer'),
    domain('docs', input.docs, 'documentation'),
    domain('release', input.scripts, 'release'),
    domain('changed-files', input.changedFiles, 'verifier')
  ]
  return domains
    .map((row) => ({
      ...row,
      priority: row.files.length + (input.prompt.toLowerCase().includes(row.id) ? 25 : 0) + (input.route.toLowerCase().includes(row.id) ? 10 : 0)
    }))
    .sort((a, b) => b.priority - a.priority)
}

function buildParallelGroups(sourceFiles: string[], testFiles: string[], docs: string[], scripts: string[]) {
  return [
    { group_id: 'runtime-source', files: sourceFiles.filter((file) => file.startsWith('src/core/')).slice(0, 50), persona: 'implementer' },
    { group_id: 'cli-surface', files: sourceFiles.filter((file) => file.startsWith('src/cli/') || file.startsWith('src/core/commands/')).slice(0, 50), persona: 'implementer' },
    { group_id: 'tests', files: testFiles.slice(0, 50), persona: 'verifier' },
    { group_id: 'docs-release', files: [...docs, ...scripts].slice(0, 50), persona: 'release' }
  ].filter((row) => row.files.length)
}

function qualityScore(input: { sourceFiles: string[]; testFiles: string[]; ownership: any; criticalPath: any; bottlenecks: any; priorities: any[] }) {
  const hasInventory = input.sourceFiles.length > 0 ? 0.2 : 0
  const hasTests = input.testFiles.length > 0 ? 0.15 : 0
  const ownershipRatio = input.sourceFiles.length ? input.ownership.mapped_source_count / input.sourceFiles.length : 0
  const hasCritical = input.criticalPath.path.length > 0 ? 0.2 : 0
  const hasBottlenecks = input.bottlenecks.bottlenecks.length > 0 ? 0.15 : 0
  const hasPriorities = input.priorities.length > 0 ? 0.1 : 0
  return Number(Math.min(1, hasInventory + hasTests + ownershipRatio * 0.2 + hasCritical + hasBottlenecks + hasPriorities).toFixed(3))
}

async function changedFilesForRoot(root: string) {
  try {
    const result = await runProcess('git', ['diff', '--name-only'], { cwd: root, timeoutMs: 3000, maxOutputBytes: 128 * 1024 })
    return result.stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

function basenameNoExt(file: string) {
  return path.basename(file).replace(/\.[^.]+$/, '').replace(/\.test$/, '')
}

function domain(id: string, files: string[], persona: string) {
  return { id, files: files.slice(0, 100), persona }
}
