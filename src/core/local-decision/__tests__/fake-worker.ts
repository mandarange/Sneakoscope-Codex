/**
 * Test-only fake worker. It speaks the NDJSON worker protocol without any
 * model so the broker's failure handling can be exercised on CPU. The model id
 * is `test-only-model`; nothing in production can select this script.
 *
 * Flags: --ready-delay-ms N, --result-delay-ms N, --crash-after N (exit before
 * answering the Nth infer), --wrong-request-id, --garbage, --oversize,
 * --no-ready, --hang-on-infer, --abstain, --fatal, --model-id X
 */
import crypto from 'node:crypto'
import readline from 'node:readline'

const argv = process.argv.slice(2)
function flag(name: string): boolean { return argv.includes(name) }
function value(name: string, fallback: string): string {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] !== undefined ? String(argv[index + 1]) : fallback
}
const readyDelay = Number(value('--ready-delay-ms', '0'))
const resultDelay = Number(value('--result-delay-ms', '0'))
const crashAfter = Number(value('--crash-after', '0'))
const generationId = `fake-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
const model = {
  modelId: value('--model-id', 'test-only-model'),
  modelRevision: 'test-only-revision',
  engineVersion: 'fixture',
  tokenizerDigest: 'fixture',
  quantization: 'fixture',
  implementationOrigin: 'sks'
}
const FIELDS: Record<string, Array<[string, string[]]>> = {
  planning: [
    ['workloadClass', ['mechanical', 'bounded', 'complex', 'unknown']],
    ['fanoutAdvice', ['keep', 'reduce_if_optional', 'abstain']],
    ['effortAdvice', ['keep', 'consider_lower', 'consider_higher', 'abstain']]
  ],
  recovery: [
    ['failureClass', ['environment', 'test', 'implementation', 'unknown']],
    ['nextAction', ['inspect_evidence', 'replan', 'escalate', 'abstain']]
  ]
}
let infers = 0

function emit(frame: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ protocolVersion: 1, ...frame })}\n`)
}

function fieldResult(values: string[], seed: string) {
  const selectedIndex = crypto.createHash('sha256').update(seed).digest()[0]! % values.length
  const top = 0.9
  const other = (1 - top) / (values.length - 1)
  return {
    value: values[selectedIndex],
    choices: values.map((entry) => ({ value: entry, candidateProbability: entry === values[selectedIndex] ? top : other })),
    calibrationStatus: 'uncalibrated',
    margin: top - other
  }
}

function buildResult(input: any) {
  if (flag('--abstain')) return { status: 'abstain', requestId: input.requestId, reason: 'low_signal' }
  const fields: Record<string, unknown> = {}
  for (const [name, values] of FIELDS[input.kind] || []) fields[name] = fieldResult(values, `${input.summary}:${name}`)
  return {
    status: 'ok',
    requestId: flag('--wrong-request-id') ? `${input.requestId}-other` : input.requestId,
    scope: input.scope,
    kind: input.kind,
    fields,
    model,
    timing: { queueMs: 0, inferenceMs: resultDelay, totalMs: resultDelay, coldStart: false },
    compute: { inputTokens: null, inputTokenEvidence: null, forwardPasses: 1, sharedPrefill: false }
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  let frame: any
  try { frame = JSON.parse(line) } catch { return }
  if (frame.type === 'ping') { emit({ type: 'pong', generationId }); return }
  if (frame.type === 'shutdown') { process.exit(0) }
  if (frame.type !== 'infer') return
  infers += 1
  if (crashAfter > 0 && infers >= crashAfter) process.exit(3)
  if (flag('--hang-on-infer')) return
  setTimeout(() => {
    if (flag('--garbage')) { process.stdout.write('{"protocolVersion":1,"type":"result","requestId":"' ); process.stdout.write('\n'); return }
    if (flag('--oversize')) { process.stdout.write(`${JSON.stringify({ protocolVersion: 1, type: 'result', generationId, requestId: frame.requestId, result: { pad: 'x'.repeat(70 * 1024) } })}\n`); return }
    emit({ type: 'result', generationId, requestId: frame.requestId, result: buildResult(frame.input) })
  }, resultDelay)
})
rl.on('close', () => process.exit(0))

setTimeout(() => {
  if (flag('--fatal')) { emit({ type: 'fatal', reason: 'model_load_failed' }); return }
  if (flag('--no-ready')) return
  emit({ type: 'ready', generationId, realModelVerified: false, model, warmup: { fixture: true }, loadMs: readyDelay })
}, readyDelay)
