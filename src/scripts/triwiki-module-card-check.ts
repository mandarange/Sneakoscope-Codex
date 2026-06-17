// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/triwiki/triwiki-module-card.js');
assertGate(mod.DEFAULT_TRIWIKI_MODULE_CARDS.length >= 10, 'module cards must cover 4.0.0 workstreams', mod.DEFAULT_TRIWIKI_MODULE_CARDS);
assertGate(mod.moduleIdsForPath('src/core/triwiki/triwiki-proof-bank.ts').includes('triwiki'), 'triwiki module path mapping failed');
emitGate('triwiki:module-card', { modules: mod.DEFAULT_TRIWIKI_MODULE_CARDS.length });
