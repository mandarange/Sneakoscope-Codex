// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release/resource-class-budget.js');
const budget = mod.computeResourceClassBudget({ SKS_RESOURCE_CPU_LIGHT: '3' });
assertGate(budget.schema === 'sks.resource-class-budget.v1' && budget.cpu_light === 3 && budget.secret_sensitive === 1, 'resource budget env/defaults mismatch', budget);
emitGate('scheduler:resource-budget', budget);
