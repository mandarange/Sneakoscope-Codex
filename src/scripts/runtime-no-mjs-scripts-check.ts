#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const scriptsDir = path.join(root, 'scripts')
const binDir = path.join(root, 'bin')
const mjs = [...await collectMjs(scriptsDir), ...await collectMjs(binDir)].sort()
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const scriptRefs = Object.entries(packageJson.scripts || {})
  .filter(([, command]) => typeof command === 'string' && /(^|[\s;&|])\.\/(?:scripts|bin)\/[^ ]+\.mjs\b/.test(command as string))
  .map(([name, command]) => ({ name, command }))
const ok = mjs.length === 0 && scriptRefs.length === 0
emit({
  schema: 'sks.runtime-no-mjs-scripts-check.v1',
  ok,
  production_mjs_count: mjs.length,
  production_mjs_sample: mjs.slice(0, 20).map((file) => path.relative(root, file)),
  package_script_mjs_refs: scriptRefs.slice(0, 40),
  blockers: ok ? [] : ['runtime_mjs_scripts_remaining']
})

async function collectMjs(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await collectMjs(full))
    else if (entry.name.endsWith('.mjs')) out.push(full)
  }
  return out.sort()
}

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
