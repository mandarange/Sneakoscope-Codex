import test from 'node:test';
import assert from 'node:assert/strict';

test('session_id is stable per mission and lane', () => {
  const missionId = 'glm-naruto-test-mission';
  const laneId = 'worker-0';
  const sessionId = `sks-glm-naruto-${missionId}-${laneId}`;
  // Same mission+lane produces same session_id
  const sessionId2 = `sks-glm-naruto-${missionId}-${laneId}`;
  assert.equal(sessionId, sessionId2);
  // Different lane produces different session_id
  const differentLane = `sks-glm-naruto-${missionId}-worker-1`;
  assert.notEqual(sessionId, differentLane);
});
