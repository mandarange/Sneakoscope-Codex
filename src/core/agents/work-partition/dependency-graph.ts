export function buildDependencyGraph(inventory: any = {}) {
  const files: string[] = inventory.files || []
  const edges = files
    .filter((file) => /\.(?:ts|mjs|js)$/.test(file))
    .map((file) => ({ from: file, imports: inferImportTargets(file, files) }))
    .filter((entry) => entry.imports.length)
  return {
    schema: 'sks.agent-dependency-graph.v1',
    nodes: files,
    edges,
    package_boundaries: [...new Set(files.map((file) => file.split('/')[0]))].sort(),
    test_to_source_relations: files.filter((file) => /^test\//.test(file)).map((file) => ({ test: file, source_hint: file.replace(/^test\//, 'src/').replace(/\.test\.mjs$/, '.ts') }))
  }
}

function inferImportTargets(file: string, files: string[]) {
  const base = file.replace(/\.(?:test\.)?(?:ts|mjs|js)$/, '')
  return files.filter((candidate) => candidate !== file && candidate.startsWith(base)).slice(0, 5)
}

