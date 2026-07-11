import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('versioning bump --help never advances package metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-versioning-help-'))
  const packageFile = path.join(root, 'package.json')
  const before = '{"name":"fixture","version":"1.2.3"}\n'
  fs.writeFileSync(packageFile, before)
  try {
    const result = spawnSync(process.execPath, [path.resolve(process.cwd(), 'dist/bin/sks.js'), 'versioning', 'bump', '--help'], {
      cwd: root,
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Usage: sks versioning/)
    assert.equal(fs.readFileSync(packageFile, 'utf8'), before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
