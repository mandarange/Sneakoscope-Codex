import fs from 'node:fs'
import path from 'node:path'

export function buildDependencyGraph(inventory: any = {}) {
  const files: string[] = inventory.files || []
  const fileSet = new Set(files)
  const root = inventory.root || process.cwd()
  const edges = files
    .filter((file) => /\.(?:ts|mjs|js)$/.test(file))
    .map((file) => ({ from: file, imports: parseImportTargets(root, file, fileSet) }))
    .filter((entry) => entry.imports.length)
  return {
    schema: 'sks.agent-dependency-graph.v1',
    nodes: files,
    edges,
    parsed_import_edges: true,
    package_boundaries: [...new Set(files.map((file) => file.split('/')[0]))].sort(),
    test_to_source_relations: files.filter((file) => /^test\//.test(file)).map((file) => ({ test: file, source_hint: file.replace(/^test\//, 'src/').replace(/\.test\.mjs$/, '.ts') }))
  }
}

function parseImportTargets(root: string, file: string, files: Set<string>) {
  const full = path.join(root, file)
  const text = fs.readFileSync(full, 'utf8')
  const imports = new Set<string>()
  const re = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of text.matchAll(re)) {
    const spec = match[1] || match[2] || ''
    if (!spec.startsWith('.')) continue
    const resolved = resolveRelativeImport(file, spec, files)
    if (resolved) imports.add(resolved)
  }
  return [...imports].sort()
}

function resolveRelativeImport(fromFile: string, spec: string, files: Set<string>) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
  const candidates = [base, base + '.ts', base + '.mjs', base + '.js', path.posix.join(base, 'index.ts'), path.posix.join(base, 'index.mjs'), path.posix.join(base, 'index.js')]
  return candidates.find((candidate) => files.has(candidate)) || ''
}
