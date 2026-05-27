import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export const INTELLIGENT_WORK_GRAPH_SCHEMA = 'sks.intelligent-work-graph.v2'

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
  ast_coverage: number
  ast_inventory: any
  file_to_symbols: Record<string, string[]>
  symbol_to_files: Record<string, string[]>
  exported_symbols: Record<string, string[]>
  imported_symbols: Record<string, string[]>
  exported_api_ownership: Record<string, string>
  command_to_module_ownership: Record<string, string[]>
  route_to_module_ownership: Record<string, string[]>
  test_ownership_map: any
  test_ownership_confidence: number
  source_to_test_relations: any[]
  changed_file_candidates: string[]
  route_domain_priority: any[]
  critical_path: any
  integration_bottlenecks: any
  parallelizable_groups: any[]
  serial_dependency_groups: any[]
  work_graph_quality_score: number
  proof_level: 'proven' | 'partial' | 'blocked'
  ast_parser_limitations: string[]
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
    root: input.root,
    route: input.route || '$Agent',
    prompt: input.prompt || '',
    changedFiles
  })
}

export function buildIntelligentWorkGraphFromData(input: {
  inventory: any
  dependencyGraph: any
  root?: string
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
  const ast = buildAstSymbolInventory(input.root || inventory.root || process.cwd(), sourceFiles, testFiles, scripts)
  const ownership = buildTestOwnershipMap(sourceFiles, testFiles, ast, input.dependencyGraph)
  const criticalPath = buildCriticalPath(sourceFiles, edges)
  const bottlenecks = buildIntegrationBottlenecks(edges, input.changedFiles || [])
  const priorities = buildRouteDomainPriority({ route: input.route || '$Agent', prompt: input.prompt || '', sourceFiles, docs, scripts, changedFiles: input.changedFiles || [] })
  const astSourceParsedCount = ast.parsed_files.filter((file: string) => sourceFiles.includes(file)).length
  const astCoverage = sourceFiles.length ? astSourceParsedCount / sourceFiles.length : 0
  const testOwnershipConfidence = sourceFiles.length ? ownership.relations.reduce((sum: number, row: any) => sum + Number(row.confidence_score || 0), 0) / Math.max(1, sourceFiles.length) : 0
  const warnings = [
    ...ownership.unmapped_sources.slice(0, 50).map((file: string) => `source_without_test_mapping:${file}`),
    ...(input.changedFiles || []).filter((file) => !ownership.owner_by_source[file] && /^src\//.test(file)).map((file) => `changed_file_without_owner:${file}`),
    ...(criticalPath.path.length > 0 && priorities.length > 0 && (priorities[0]?.priority ?? 0) < 50 ? ['critical_path_low_priority_warning'] : []),
    ...ast.limitations.map((item: string) => `ast_parser_limitation:${item}`)
  ]
  const score = qualityScore({ sourceFiles, testFiles, ownership, criticalPath, bottlenecks, priorities, astCoverage, testOwnershipConfidence })
  const proofLevel = score >= 0.7 && astCoverage > 0 ? 'proven' : score >= 0.35 ? 'partial' : 'blocked'
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
    ast_coverage: Number(astCoverage.toFixed(3)),
    ast_inventory: ast,
    file_to_symbols: ast.file_to_symbols,
    symbol_to_files: ast.symbol_to_files,
    exported_symbols: ast.exported_symbols,
    imported_symbols: ast.imported_symbols,
    exported_api_ownership: ast.exported_api_ownership,
    command_to_module_ownership: ast.command_to_module_ownership,
    route_to_module_ownership: ast.route_to_module_ownership,
    test_ownership_map: ownership,
    test_ownership_confidence: Number(testOwnershipConfidence.toFixed(3)),
    source_to_test_relations: ownership.relations,
    changed_file_candidates: input.changedFiles || [],
    route_domain_priority: priorities,
    critical_path: criticalPath,
    integration_bottlenecks: bottlenecks,
    parallelizable_groups: buildParallelGroups(sourceFiles, testFiles, docs, scripts),
    serial_dependency_groups: criticalPath.path.length ? [{ group_id: 'critical-path', files: criticalPath.path, reason: 'longest import chain' }] : [],
    work_graph_quality_score: score,
    proof_level: proofLevel,
    ast_parser_limitations: ast.limitations,
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
      integration_bottleneck_ref: 'agent-integration-bottlenecks.json',
      dependencies: mergeDependencies(item.dependencies, critical && index > 0 ? [taskGraph.work_items[index - 1]?.work_item_id].filter(Boolean) : []),
      lease_requirements: [
        ...(Array.isArray(item.lease_requirements) ? item.lease_requirements : []),
        ...(bottleneck ? targets.map((file: string) => ({ kind: 'integration-bottleneck-read', path: file })) : [])
      ]
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
  await writeJsonAtomic(path.join(root, 'agent-intelligent-work-graph-v2.json'), graph)
  await writeJsonAtomic(path.join(root, 'agent-symbol-ownership-map.json'), {
    schema: 'sks.agent-symbol-ownership-map.v1',
    generated_at: graph.generated_at,
    ok: Object.keys(graph.symbol_to_files).length > 0,
    ast_coverage: graph.ast_coverage,
    file_to_symbols: graph.file_to_symbols,
    symbol_to_files: graph.symbol_to_files,
    exported_symbols: graph.exported_symbols,
    imported_symbols: graph.imported_symbols,
    exported_api_ownership: graph.exported_api_ownership
  })
  await writeJsonAtomic(path.join(root, 'agent-route-ownership-map.json'), {
    schema: 'sks.agent-route-ownership-map.v1',
    generated_at: graph.generated_at,
    ok: Object.keys(graph.route_to_module_ownership).length > 0,
    route_to_module_ownership: graph.route_to_module_ownership
  })
  await writeJsonAtomic(path.join(root, 'agent-command-ownership-map.json'), {
    schema: 'sks.agent-command-ownership-map.v1',
    generated_at: graph.generated_at,
    ok: Object.keys(graph.command_to_module_ownership).length > 0,
    command_to_module_ownership: graph.command_to_module_ownership
  })
  await writeJsonAtomic(path.join(root, 'agent-test-ownership-map.json'), {
    schema: 'sks.agent-test-ownership-map.v1',
    generated_at: graph.generated_at,
    ok: graph.test_ownership_map.unmapped_sources.length < Math.max(10, graph.source_inventory_count),
    ast_coverage: graph.ast_coverage,
    test_ownership_confidence: graph.test_ownership_confidence,
    ...graph.test_ownership_map
  })
  await writeJsonAtomic(path.join(root, 'agent-source-test-ownership-v2.json'), {
    schema: 'sks.agent-source-test-ownership.v2',
    generated_at: graph.generated_at,
    ok: graph.test_ownership_confidence > 0,
    ast_coverage: graph.ast_coverage,
    test_ownership_confidence: graph.test_ownership_confidence,
    source_to_test_relations: graph.source_to_test_relations,
    ...graph.test_ownership_map
  })
  await writeJsonAtomic(path.join(root, 'agent-critical-path.json'), {
    schema: 'sks.agent-critical-path.v1',
    generated_at: graph.generated_at,
    ok: graph.critical_path.path.length > 0,
    ...graph.critical_path
  })
  await writeJsonAtomic(path.join(root, 'agent-critical-path-v2.json'), {
    schema: 'sks.agent-critical-path.v2',
    generated_at: graph.generated_at,
    ok: graph.critical_path.path.length > 0,
    ast_coverage: graph.ast_coverage,
    critical_path_confidence: graph.critical_path.confidence || graph.test_ownership_confidence,
    ...graph.critical_path
  })
  await writeJsonAtomic(path.join(root, 'agent-integration-bottlenecks.json'), {
    schema: 'sks.agent-integration-bottlenecks.v1',
    generated_at: graph.generated_at,
    ok: true,
    critical_path_confidence: graph.critical_path.confidence || null,
    ...graph.integration_bottlenecks
  })
  await writeJsonAtomic(path.join(root, 'agent-integration-bottlenecks-v2.json'), {
    schema: 'sks.agent-integration-bottlenecks.v2',
    generated_at: graph.generated_at,
    ok: true,
    critical_path_confidence: graph.critical_path.confidence || null,
    ...graph.integration_bottlenecks
  })
}

function buildTestOwnershipMap(sourceFiles: string[], testFiles: string[], ast: any, dependencyGraph: any = {}) {
  const ownerBySource: Record<string, string[]> = {}
  const relations: any[] = []
  const dependencyRelations = Array.isArray(dependencyGraph?.test_to_source_relations) ? dependencyGraph.test_to_source_relations : []
  for (const source of sourceFiles) {
    const base = basenameNoExt(source)
    const sourceSymbols = new Set((ast.exported_symbols?.[source] || []).length ? ast.exported_symbols[source] : ast.file_to_symbols?.[source] || [])
    const hinted = testFiles.filter((test) => {
      if (test.includes(base) || test.includes(source.replace(/^src\//, '').replace(/\.[^.]+$/, ''))) return true
      if (dependencyRelations.some((row: any) => row.test === test && row.source_hint === source)) return true
      const testImports = new Set(ast.imported_symbols?.[test] || [])
      return [...sourceSymbols].some((symbol) => testImports.has(symbol))
    })
    ownerBySource[source] = hinted
    for (const test of hinted) {
      const symbolOverlap = (ast.imported_symbols?.[test] || []).filter((symbol: string) => sourceSymbols.has(symbol))
      const confidenceScore = test.includes(base) ? 1 : symbolOverlap.length ? 0.8 : 0.55
      relations.push({ source, test, confidence: confidenceScore >= 0.9 ? 'high' : confidenceScore >= 0.75 ? 'medium' : 'low', confidence_score: confidenceScore, symbol_overlap: symbolOverlap })
    }
  }
  return {
    owner_by_source: ownerBySource,
    mapped_source_count: Object.values(ownerBySource).filter((rows) => rows.length > 0).length,
    unmapped_sources: Object.entries(ownerBySource).filter(([, rows]) => rows.length === 0).map(([source]) => source),
    relations
  }
}

function buildAstSymbolInventory(root: string, sourceFiles: string[], testFiles: string[], scripts: string[]) {
  const maxFiles = Number(process.env.SKS_AST_WORK_GRAPH_MAX_FILES || 2000)
  const candidateFiles = [...new Set([...sourceFiles, ...testFiles, ...scripts])]
    .filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file))
    .slice(0, maxFiles)
  const fileToSymbols: Record<string, string[]> = {}
  const symbolToFiles: Record<string, string[]> = {}
  const exportedApiOwnership: Record<string, string> = {}
  const exportedSymbols: Record<string, string[]> = {}
  const importedSymbols: Record<string, string[]> = {}
  const commandToModuleOwnership: Record<string, string[]> = {}
  const routeToModuleOwnership: Record<string, string[]> = {}
  const parsedFiles: string[] = []
  const limitations = [
    'typescript_compiler_api_syntax_only_no_type_checker',
    'dynamic_imports_best_effort',
    ...(candidateFiles.length < sourceFiles.length + testFiles.length + scripts.length ? ['file_budget_truncated'] : [])
  ]
  for (const file of candidateFiles) {
    const text = safeRead(path.join(root, file))
    if (!text) continue
    parsedFiles.push(file)
    const ast = parseAstSymbols(file, text)
    const symbols = [...new Set([...ast.declared_symbols, ...ast.exported_symbols, ...ast.imported_symbols])].sort()
    fileToSymbols[file] = symbols
    exportedSymbols[file] = ast.exported_symbols
    importedSymbols[file] = ast.imported_symbols
    for (const symbol of symbols) {
      symbolToFiles[symbol] = [...(symbolToFiles[symbol] || []), file]
    }
    for (const symbol of ast.exported_symbols) exportedApiOwnership[symbol] = file
    if (/src\/core\/commands\/.+-command\.ts$/.test(file) || /src\/cli\/.+-command\.ts$/.test(file)) {
      const command = path.basename(file).replace(/-command\.[^.]+$/, '')
      commandToModuleOwnership[command] = [...(commandToModuleOwnership[command] || []), file]
    }
    for (const route of parseRouteHints(text, file)) {
      routeToModuleOwnership[route] = [...(routeToModuleOwnership[route] || []), file]
    }
  }
  return {
    schema: 'sks.ast-symbol-inventory.v1',
    max_files: maxFiles,
    parsed_files: parsedFiles,
    parsed_file_count: parsedFiles.length,
    file_to_symbols: fileToSymbols,
    symbol_to_files: symbolToFiles,
    exported_symbols: exportedSymbols,
    imported_symbols: importedSymbols,
    exported_api_ownership: exportedApiOwnership,
    command_to_module_ownership: commandToModuleOwnership,
    route_to_module_ownership: routeToModuleOwnership,
    limitations
  }
}

function safeRead(file: string) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function parseAstSymbols(file: string, text: string) {
  const declared = new Set<string>()
  const exported = new Set<string>()
  const imported = new Set<string>()
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindForFile(file))
  const addName = (node: { name?: ts.PropertyName | ts.BindingName }) => {
    const name = node.name
    if (!name) return
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) declared.add(name.text)
  }
  const addBinding = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) declared.add(name.text)
    else for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) addBinding(element.name)
    }
  }
  const exportedModifier = (node: ts.Node) => ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
      addName(node)
      if (node.name && exportedModifier(node)) exported.add(node.name.text)
    } else if (ts.isVariableStatement(node)) {
      const isExported = exportedModifier(node)
      for (const declaration of node.declarationList.declarations) {
        addBinding(declaration.name)
        if (isExported && ts.isIdentifier(declaration.name)) exported.add(declaration.name.text)
      }
    } else if (ts.isImportDeclaration(node) && node.importClause) {
      if (node.importClause.name) imported.add(node.importClause.name.text)
      const bindings = node.importClause.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) imported.add((specifier.propertyName || specifier.name).text)
      } else if (bindings && ts.isNamespaceImport(bindings)) imported.add(bindings.name.text)
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const specifier of node.exportClause.elements) exported.add(specifier.name.text)
    } else if (ts.isExportAssignment(node)) {
      exported.add('default')
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return {
    declared_symbols: [...declared].sort(),
    exported_symbols: [...exported].sort(),
    imported_symbols: [...imported].sort()
  }
}

function scriptKindForFile(file: string) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX
  if (/\.json$/i.test(file)) return ts.ScriptKind.JSON
  if (/\.[cm]?js$/i.test(file)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function parseRouteHints(text: string, file: string) {
  const out = new Set<string>()
  if (/routes?\.ts$/.test(file)) {
    for (const match of text.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)) if (match[1]) out.add(match[1])
  }
  for (const match of text.matchAll(/\$([A-Za-z][A-Za-z-]+)/g)) if (match[1]) out.add(match[1].toLowerCase())
  return [...out].sort()
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

function qualityScore(input: { sourceFiles: string[]; testFiles: string[]; ownership: any; criticalPath: any; bottlenecks: any; priorities: any[]; astCoverage?: number; testOwnershipConfidence?: number }) {
  const hasInventory = input.sourceFiles.length > 0 ? 0.2 : 0
  const hasTests = input.testFiles.length > 0 ? 0.15 : 0
  const ownershipRatio = input.sourceFiles.length ? input.ownership.mapped_source_count / input.sourceFiles.length : 0
  const hasCritical = input.criticalPath.path.length > 0 ? 0.2 : 0
  const hasBottlenecks = input.bottlenecks.bottlenecks.length > 0 ? 0.15 : 0
  const hasPriorities = input.priorities.length > 0 ? 0.1 : 0
  const ast = Math.min(0.1, Number(input.astCoverage || 0) * 0.1)
  const confidence = Math.min(0.1, Number(input.testOwnershipConfidence || 0) * 0.1)
  return Number(Math.min(1, hasInventory + hasTests + ownershipRatio * 0.15 + hasCritical + hasBottlenecks + hasPriorities + ast + confidence).toFixed(3))
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

function mergeDependencies(left: unknown, right: string[]) {
  return [...new Set([...(Array.isArray(left) ? left.map(String) : []), ...right.map(String)])]
}
