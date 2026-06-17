// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const scheduler = await importDist('core/release/extreme-parallel-scheduler.js');
const schedule = scheduler.planExtremeParallelSchedule(root);
assertGate(schedule.schema === 'sks.extreme-parallel-scheduler.v1' && schedule.batches.length > 0, 'scheduler must produce batches', schedule);
emitGate('scheduler:extreme-parallel', { batches: schedule.batches.length, reduction_ratio: schedule.reduction_ratio, ok: schedule.ok });
