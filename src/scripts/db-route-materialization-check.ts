#!/usr/bin/env node
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareRoute } from '../core/pipeline-internals/runtime-core.js'

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-db-route-materialization-'))
try {
  await fsp.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'sks-db-route-fixture', private: true }, null, 2)}\n`)
  const prepared: any = await prepareRoute(root, '$DB inspect the local migration safely', {})
  const missionId = String(prepared?.mission_id || '')
  if (!missionId || prepared?.route?.id !== 'DB') throw new Error('DB route did not materialize a mission')

  const dir = path.join(root, '.sneakoscope', 'missions', missionId)
  const scan = JSON.parse(await fsp.readFile(path.join(dir, 'db-safety-scan.json'), 'utf8'))
  const review = JSON.parse(await fsp.readFile(path.join(dir, 'db-review.json'), 'utf8'))
  if (typeof scan?.ok !== 'boolean') throw new Error('db-safety-scan.json is missing an ok decision')
  if (typeof review?.scan_ok !== 'boolean' || review?.destructive_operation_zero !== true) {
    throw new Error('db-review.json is missing the fail-closed safety baseline')
  }

  console.log(JSON.stringify({
    schema: 'sks.db-route-materialization-check.v1',
    ok: true,
    route: '$DB',
    mission_id: missionId,
    artifacts: ['db-safety-scan.json', 'db-review.json'],
    legacy_cli_registered: false
  }, null, 2))
} finally {
  await fsp.rm(root, { recursive: true, force: true })
}
