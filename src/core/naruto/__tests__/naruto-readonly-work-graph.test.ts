import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNarutoWorkGraph, extractNarutoPromptScopes } from '../naruto-work-graph.js'

test('readonly Naruto turns five semantic prompt slices into distinct path-free work items', () => {
  const prompt = [
    'Run a final independent release audit with five slices:',
    '1) catalog transport and secret safety;',
    '2) cache atomicity and ownership;',
    '3) OAuth transition cleanup;',
    '4) bounded network and output behavior;',
    '5) package publish readiness. Inspect only and report findings; do not modify files.'
  ].join(' ')
  const graph = buildNarutoWorkGraph({
    prompt,
    requestedClones: 5,
    totalWorkItems: 5,
    honorExplicitTotalWorkItems: true,
    readonly: true,
    writeCapable: false,
    maxActiveWorkers: 5
  })

  assert.equal(graph.ok, true, graph.blockers.join(', '))
  assert.equal(graph.work_items.length, 5)
  assert.equal(new Set(graph.work_items.map((item) => item.title)).size, 5)
  assert.deepEqual(graph.work_items.map((item) => item.title), [
    'Scope 1: catalog transport and secret safety',
    'Scope 2: cache atomicity and ownership',
    'Scope 3: OAuth transition cleanup',
    'Scope 4: bounded network and output behavior',
    'Scope 5: package publish readiness'
  ])
  assert.ok(graph.mixed_work_kinds.length >= 5)
  assert.equal(graph.write_allowed_count, 0)
  assert.ok(graph.work_items.every((item) => item.write_paths.length === 0))
  assert.ok(graph.work_items.every((item) => item.readonly_paths.length === 0))
  assert.ok(graph.work_items.every((item) => item.target_paths.length === 0))
  assert.ok(graph.work_items.every((item) => item.lease_requirements.length === 0))
  assert.equal(graph.work_items.flatMap((item) => item.target_paths).filter((file) => file.includes('patch-envelopes')).length, 0)
})

test('readonly Naruto preserves and distributes explicit read and target paths', () => {
  const graph = buildNarutoWorkGraph({
    prompt: 'Three slices: 1) source inspection; 2) documentation audit; 3) test evidence review',
    requestedClones: 3,
    totalWorkItems: 3,
    honorExplicitTotalWorkItems: true,
    readonly: true,
    writeCapable: false,
    targetPaths: ['src/one.ts', 'src/two.ts'],
    readonlyPaths: ['docs/three.md'],
    maxActiveWorkers: 3
  })

  const distributed = graph.work_items.flatMap((item) => item.target_paths)
  assert.deepEqual([...new Set(distributed)].sort(), ['docs/three.md', 'src/one.ts', 'src/two.ts'])
  assert.ok(graph.work_items.every((item) => item.target_paths.length === 1))
  assert.ok(graph.work_items.every((item) => item.readonly_paths[0] === item.target_paths[0]))
  assert.ok(graph.work_items.every((item) => item.lease_requirements.every((lease) => lease.kind === 'read')))
  assert.ok(graph.work_items.every((item) => item.write_paths.length === 0 && item.acceptance.requires_patch_envelope === false))
})

test('semantic scope extraction supports numbered, semicolon, and bullet lists with a hard item cap', () => {
  assert.deepEqual(extractNarutoPromptScopes('Five slices: 1: alpha; 2: beta; 3: gamma; 4: delta', 3), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(extractNarutoPromptScopes('Review lanes:\n- security\n- performance\n- release evidence', 3), ['security', 'performance', 'release evidence'])
  assert.deepEqual(
    extractNarutoPromptScopes('Five slices: transport; cache; OAuth; network; package publish readiness. Inspect only and report findings.', 5),
    ['transport', 'cache', 'OAuth', 'network', 'package publish readiness']
  )
  assert.deepEqual(extractNarutoPromptScopes('single unstructured objective', 5), [])
})

test('write-capable Naruto keeps its existing per-item patch-envelope fallback', () => {
  const graph = buildNarutoWorkGraph({
    prompt: 'fixture write graph',
    requestedClones: 2,
    totalWorkItems: 2,
    honorExplicitTotalWorkItems: true,
    writeCapable: true,
    maxActiveWorkers: 2
  })

  assert.equal(graph.ok, true, graph.blockers.join(', '))
  assert.deepEqual(graph.work_items.map((item) => item.write_paths), [
    ['.sneakoscope/naruto/patch-envelopes/NW-000001.json'],
    ['.sneakoscope/naruto/patch-envelopes/NW-000002.json']
  ])
  assert.ok(graph.work_items.every((item) => item.acceptance.requires_patch_envelope))
})
