#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'
import { probePythonTools } from '../core/python-tools/python-tool-runner.js'

const root = packageRoot()
const probe = await probePythonTools(root)
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const scriptCommands = Object.values(packageJson.scripts || {}).map(String)
const pythonRuntimeRefs = scriptCommands.filter((command) => /(^|[\s;&|])python(?:3)?(?:\s|$)/.test(command) && /\b(?:postinstall|publish|prepack|prepublishOnly)\b/.test(command))
const pytoolsFiles = await collectPython(path.join(root, 'pytools'))
const forbiddenWrites = await findForbiddenPythonWrites(pytoolsFiles)
const ok = probe.ok
  && probe.core_runtime_requires_python === false
  && pythonRuntimeRefs.length === 0
  && forbiddenWrites.length === 0
emit({
  schema: 'sks.runtime-ts-python-boundary-check.v1',
  ok,
  probe,
  pytools_files: pytoolsFiles.map((file) => path.relative(root, file)),
  python_runtime_refs: pythonRuntimeRefs,
  forbidden_python_writes: forbiddenWrites,
  blockers: ok ? [] : ['runtime_ts_python_boundary_check_failed']
})

async function collectPython(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await collectPython(full))
    else if (entry.name.endsWith('.py')) out.push(full)
  }
  return out.sort()
}

async function findForbiddenPythonWrites(files: string[]) {
  const out: string[] = []
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8')
    if (/(\.codex|config\.toml|auth\.json|os\.environ|subprocess\.(?:run|Popen))/.test(text) && /\b(open|write_text|write_bytes|remove|unlink|rename)\b/.test(text)) {
      out.push(path.relative(packageRoot(), file))
    }
  }
  return out
}

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
