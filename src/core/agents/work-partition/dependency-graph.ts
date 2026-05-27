import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export function buildDependencyGraph(inventory: any = {}) {
  const files: string[] = inventory.files || []
  const fileSet = new Set(files)
  const root = inventory.root || process.cwd()
  const edges = files
    .filter((file) => /\.(?:tsx?|jsx?|mjs|cjs)$/.test(file))
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
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindForFile(file))
  const visit = (node: ts.Node) => {
    const spec = moduleSpecifier(node)
    if (spec?.startsWith('.')) {
      const resolved = resolveRelativeImport(file, spec, files)
      if (resolved) imports.add(resolved)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...imports].sort()
}

function resolveRelativeImport(fromFile: string, spec: string, files: Set<string>) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
  const candidates = [base, base + '.ts', base + '.tsx', base + '.mts', base + '.cts', base + '.mjs', base + '.cjs', base + '.js', base + '.jsx', path.posix.join(base, 'index.ts'), path.posix.join(base, 'index.tsx'), path.posix.join(base, 'index.mjs'), path.posix.join(base, 'index.cjs'), path.posix.join(base, 'index.js'), path.posix.join(base, 'index.jsx')]
  return candidates.find((candidate) => files.has(candidate)) || ''
}

function moduleSpecifier(node: ts.Node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    const first = node.arguments[0]
    if (first && ts.isStringLiteral(first)) return first.text
  }
  return ''
}

function scriptKindForFile(file: string) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/i.test(file)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}
