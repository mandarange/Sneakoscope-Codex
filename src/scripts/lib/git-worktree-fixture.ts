import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export function makeGitFixture(name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sks-${name}-`))
  run('git', ['init'], root)
  run('git', ['config', 'user.email', 'sks@example.invalid'], root)
  run('git', ['config', 'user.name', 'SKS Test'], root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha\n')
  fs.writeFileSync(path.join(root, 'b.txt'), 'bravo\n')
  run('git', ['add', 'a.txt', 'b.txt'], root)
  run('git', ['commit', '-m', 'fixture'], root)
  return root
}

export function makeNonGitFixture(name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sks-${name}-`))
  fs.writeFileSync(path.join(root, 'plain.txt'), 'not git\n')
  return root
}

export function run(command: string, args: string[], cwd: string, input?: string) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`)
  }
  return result.stdout || ''
}
