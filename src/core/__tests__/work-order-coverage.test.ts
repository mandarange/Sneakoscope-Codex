import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {
  createWorkOrderLedger,
  writeWorkOrderLedger,
  readWorkOrderLedger,
  updateWorkOrderItem,
  evaluateWorkOrderCoverage,
  createAndWriteWorkOrderLedgerForPrompt,
  closeWorkOrderLedgerForRouteResult,
} from '../work-order-ledger.js';
import { evaluateStop } from '../pipeline-internals/runtime-gates.js';

async function makeTempRoot(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wo-coverage-'));
}

async function setupMission(root: string, missionId: string): Promise<string> {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function writeCurrent(root: string, patch: Record<string, unknown>): Promise<void> {
  const stateDir = path.join(root, '.sneakoscope', 'state');
  await fsp.mkdir(stateDir, { recursive: true });
  await fsp.writeFile(path.join(stateDir, 'current.json'), JSON.stringify({ ...patch, updated_at: new Date().toISOString() }, null, 2));
}

test('createWorkOrderLedger maps requests to WO-00N items with verbatim source text preserved', () => {
  const ledger = createWorkOrderLedger({
    missionId: 'M-test',
    route: 'Naruto',
    requests: [{ verbatim: '첫번째 요청' }, { verbatim: '두번째 요청' }],
    sourcesComplete: true,
  });
  assert.equal(ledger.items.length, 2);
  assert.equal(ledger.items[0].id, 'WO-001');
  assert.equal(ledger.items[0].source.verbatim, '첫번째 요청');
  assert.equal(ledger.items[1].id, 'WO-002');
  assert.equal(ledger.all_customer_requests_preserved, true);
  assert.equal(ledger.source_inventory_complete, true);
  // Nothing has been mapped to implementation tasks or verified yet.
  assert.equal(ledger.all_customer_requests_mapped, false);
  assert.equal(ledger.all_work_items_verified, false);
});

test('evaluateWorkOrderCoverage blocks while any item is pending, passes once every item is verified or honestly blocked', () => {
  let ledger = createWorkOrderLedger({
    missionId: 'M-test',
    route: 'Naruto',
    requests: [{ verbatim: 'item A' }, { verbatim: 'item B' }],
    sourcesComplete: true,
  });
  const pending = evaluateWorkOrderCoverage(ledger);
  assert.equal(pending.ok, false);
  assert.equal(pending.uncovered_count, 2);
  assert.ok(pending.blockers.some((b) => b.startsWith('work_order_uncovered:WO-001')));
  assert.ok(pending.blockers.some((b) => b.startsWith('work_order_uncovered:WO-002')));

  ledger = updateWorkOrderItem(ledger, 'WO-001', { status: 'verified', implementation_tasks: ['did the thing'] });
  const halfDone = evaluateWorkOrderCoverage(ledger);
  assert.equal(halfDone.ok, false);
  assert.equal(halfDone.uncovered_count, 1);

  ledger = updateWorkOrderItem(ledger, 'WO-002', { status: 'blocked', blocker: { blocked: true, reason: 'out of scope', needed_to_unblock: 'n/a' } });
  const done = evaluateWorkOrderCoverage(ledger);
  assert.equal(done.ok, true);
  assert.equal(done.uncovered_count, 0);
  assert.deepEqual(done.blockers, []);
});

test('evaluateWorkOrderCoverage blocks on a truncated source inventory even if every parsed item is resolved', () => {
  let ledger = createWorkOrderLedger({
    missionId: 'M-test',
    route: 'Naruto',
    requests: [{ verbatim: 'only item we kept' }],
    sourcesComplete: false, // parser signaled it dropped items beyond its ceiling
  });
  ledger = updateWorkOrderItem(ledger, 'WO-001', { status: 'verified', implementation_tasks: ['done'] });
  const result = evaluateWorkOrderCoverage(ledger);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('work_order_inventory_truncated'));
});

test('evaluateWorkOrderCoverage treats a missing ledger as ok (nothing to enforce yet)', () => {
  const result = evaluateWorkOrderCoverage(null);
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test('createAndWriteWorkOrderLedgerForPrompt persists one ledger item per numbered work-order line', async () => {
  const root = await makeTempRoot();
  const dir = path.join(root, 'mission');
  await fsp.mkdir(dir, { recursive: true });
  const prompt = '1. 첫번째 작업\n2. 두번째 작업\n3. 세번째 작업';
  await createAndWriteWorkOrderLedgerForPrompt(dir, { missionId: 'M-wo-1', route: 'Naruto', prompt });
  const ledger = await readWorkOrderLedger(dir);
  assert.ok(ledger);
  assert.equal(ledger.items.length, 3);
  assert.equal(ledger.items[0].source.verbatim, '첫번째 작업');
  assert.equal(ledger.items[2].source.verbatim, '세번째 작업');
  assert.equal(ledger.source_inventory_complete, true);
});

test('closeWorkOrderLedgerForRouteResult resolves every item to verified on success and to blocked with the real reason on failure', async () => {
  const root = await makeTempRoot();
  const dir = path.join(root, 'mission');
  await fsp.mkdir(dir, { recursive: true });
  await writeWorkOrderLedger(dir, createWorkOrderLedger({
    missionId: 'M-wo-2',
    route: 'Goal',
    requests: [{ verbatim: 'a' }, { verbatim: 'b' }],
    sourcesComplete: true,
  }));

  await closeWorkOrderLedgerForRouteResult(dir, { ok: false, blockers: ['some_real_blocker'] });
  let closed = await readWorkOrderLedger(dir);
  assert.ok(closed);
  assert.ok(closed.items.every((item: any) => item.status === 'blocked'));
  assert.ok(closed.items.every((item: any) => item.blocker.reason === 'some_real_blocker'));
  assert.equal(evaluateWorkOrderCoverage(closed).ok, true, 'an honestly blocked ledger is a passing coverage check');

  await closeWorkOrderLedgerForRouteResult(dir, { ok: true, blockers: [] });
  closed = await readWorkOrderLedger(dir);
  assert.ok(closed.items.every((item: any) => item.status === 'verified'));
  assert.equal(evaluateWorkOrderCoverage(closed).ok, true);
});

test('closeWorkOrderLedgerForRouteResult is a no-op when there is no ledger to close', async () => {
  const root = await makeTempRoot();
  const dir = path.join(root, 'mission');
  await fsp.mkdir(dir, { recursive: true });
  const result = await closeWorkOrderLedgerForRouteResult(dir, { ok: true });
  assert.equal(result, null);
});

test('evaluateStop blocks a Naruto mission with unresolved work-order-ledger items even though its own gate passed', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-wo-block';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1', terminal: true }));
  await writeWorkOrderLedger(dir, createWorkOrderLedger({
    missionId,
    route: 'Naruto',
    requests: [{ verbatim: 'unfinished item' }],
    sourcesComplete: true,
  }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false });

  const decision: any = await evaluateStop(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false }, { message: 'done' });
  assert.equal(decision?.decision, 'block');
  assert.match(decision?.reason, /unresolved work-order-ledger items/);
});

test('evaluateStop allows a Naruto mission to stop once every work-order-ledger item resolves', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-wo-allow';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1', terminal: true }));
  let ledger = createWorkOrderLedger({
    missionId,
    route: 'Naruto',
    requests: [{ verbatim: 'finished item' }],
    sourcesComplete: true,
  });
  ledger = updateWorkOrderItem(ledger, 'WO-001', { status: 'verified', implementation_tasks: ['done'] });
  await writeWorkOrderLedger(dir, ledger);
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false });

  const decision: any = await evaluateStop(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false }, { message: 'done' });
  assert.equal(decision?.continue, true, 'evaluateStop allows stop once every route/coverage gate passes');
  assert.match(decision?.systemMessage, /canonical stop-gate passed/);
});

test('evaluateStop blocks a coverage_required route entirely missing its work-order-ledger', async () => {
  const root = await makeTempRoot();
  const missionId = 'M-wo-missing';
  const dir = await setupMission(root, missionId);
  await fsp.writeFile(path.join(dir, 'naruto-gate.json'), JSON.stringify({ passed: true, schema: 'sks.naruto-gate.v1', terminal: true }));
  await writeCurrent(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false });

  const decision: any = await evaluateStop(root, { mission_id: missionId, stop_gate: 'naruto-gate.json', mode: 'NARUTO', route: 'Naruto', route_command: '$Naruto', agents_required: false, proof_required: false, reflection_required: false }, { message: 'done' });
  assert.equal(decision?.decision, 'block');
  assert.match(decision?.reason, /work_order_ledger_missing/);
});
