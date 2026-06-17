// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const task = readText('src/core/commands/task-command.ts');
assertGate(task.includes('--tier') && task.includes('confidence') && task.includes('--sla'), 'task command must route to SLA confidence check');
emitGate('cli:five-minute-task');
