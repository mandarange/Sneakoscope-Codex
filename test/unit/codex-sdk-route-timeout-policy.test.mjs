import test from 'node:test';
import assert from 'node:assert/strict';

test('Naruto workers receive the route-contract long timeout while ordinary agents keep existing limits', async () => {
  const { codexTimeoutClassForRoute, normalizeCodexReliabilityPolicy } = await import('../../dist/core/codex-control/codex-reliability-shield.js');
  const { codexSdkTurnTimeoutMs } = await import('../../dist/core/codex-control/codex-sdk-adapter.js');
  const previous = process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS;
  delete process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS;
  try {
    assert.equal(codexTimeoutClassForRoute('$Naruto', 'standard'), 'long');
    assert.equal(codexTimeoutClassForRoute('Naruto', 'short'), 'long');
    assert.equal(codexTimeoutClassForRoute('$Research', 'standard'), 'standard');
    assert.equal(codexTimeoutClassForRoute('$Research', 'short'), 'short');

    const naruto = task('$Naruto');
    assert.equal(normalizeCodexReliabilityPolicy(naruto).timeoutClass, 'long');
    assert.equal(codexSdkTurnTimeoutMs(naruto), 300_000);

    const staleNarutoCaller = task('$Naruto', 'standard');
    assert.equal(normalizeCodexReliabilityPolicy(staleNarutoCaller).timeoutClass, 'long');
    assert.equal(codexSdkTurnTimeoutMs(staleNarutoCaller), 300_000);

    const ordinary = task('$Research', 'standard');
    assert.equal(normalizeCodexReliabilityPolicy(ordinary).timeoutClass, 'standard');
    assert.equal(codexSdkTurnTimeoutMs(ordinary), 120_000);

    const short = task('$Research', 'short');
    assert.equal(normalizeCodexReliabilityPolicy(short).timeoutClass, 'short');
    assert.equal(codexSdkTurnTimeoutMs(short), 45_000);
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS;
    else process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS = previous;
  }
});

function task(route, timeoutClass) {
  return {
    route,
    tier: 'worker',
    missionId: 'M-timeout-policy',
    cwd: process.cwd(),
    prompt: 'fixture',
    outputSchemaId: 'fixture.v1',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true, allowed_paths: [], write_paths: [] },
    mutationLedgerRoot: process.cwd(),
    ...(timeoutClass ? { reliabilityPolicy: { timeoutClass } } : {})
  };
}
