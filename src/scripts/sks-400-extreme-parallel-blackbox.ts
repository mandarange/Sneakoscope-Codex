// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const scheduler = await importDist('core/release/extreme-parallel-scheduler.js');
const schedule = scheduler.planExtremeParallelSchedule(root);
assertGate(schedule.sequential_ms > 0 && schedule.critical_path_ms > 0, 'extreme scheduler blackbox must estimate work', schedule);
assertGate(schedule.critical_path_ms <= schedule.sequential_ms, 'critical path must not exceed sequential path', schedule);
emitGate('scheduler:extreme-parallel-blackbox', { reduction_ratio: schedule.reduction_ratio, batches: schedule.batches.length });
