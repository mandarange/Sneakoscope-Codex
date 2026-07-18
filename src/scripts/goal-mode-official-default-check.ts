#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex/official-goal-mode.js');
const official = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex /goal create', codexGoalHelpText: 'codex goal --help' });
const featureListOfficial = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex', codexGoalHelpText: '', codexFeaturesText: 'goals stable true\n' });
const unavailable = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex' });
assertGate(official.official_goal_available === true && official.default_enabled === true, 'official goal availability must default-enable goal mode', official);
assertGate(featureListOfficial.official_goal_available === true && featureListOfficial.codex_goals_feature_enabled === true, 'Codex goals feature flag must default-enable goal mode without goal subcommand help', featureListOfficial);
assertGate(unavailable.mode === 'official_goal_unavailable', 'missing official goal must fail closed without SKS fallback state', unavailable);
emitGate('goal-mode:official-default', { official: official.mode, feature_list_official: featureListOfficial.mode, unavailable: unavailable.mode });
