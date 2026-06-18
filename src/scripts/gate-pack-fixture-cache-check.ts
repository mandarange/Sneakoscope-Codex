import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release/gate-pack-fixture-cache.js');
const packId = `fixture-check-${process.pid}-${Date.now()}`;
const first = await mod.prepareGatePackFixture({ root, packId, fixtureVersion: 'sks-4.0.1' });
const second = await mod.prepareGatePackFixture({ root, packId, fixtureVersion: 'sks-4.0.1' });
assertGate(first.schema === 'sks.gate-pack-fixture.v1', 'fixture schema mismatch', first);
assertGate(first.setup_count === 1 && second.reused_base === true, 'fixture base must be created once and reused', { first, second });
emitGate('gate-pack:fixture-cache', { pack_id: packId, setup_count: first.setup_count, reused_base: second.reused_base });
