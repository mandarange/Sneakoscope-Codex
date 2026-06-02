#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/codex/official-goal-mode.js');
const official = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex /goal create', codexGoalHelpText: 'codex goal --help' });
const featureListOfficial = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex', codexGoalHelpText: '', codexFeaturesText: 'goals stable true\n' });
const fallback = await mod.detectOfficialGoalMode({ runCommand: false, codexHelpText: 'Usage: codex' });
assertGate(official.official_goal_available === true && official.default_enabled === true, 'official goal availability must default-enable goal mode', official);
assertGate(featureListOfficial.official_goal_available === true && featureListOfficial.codex_goals_feature_enabled === true, 'Codex goals feature flag must default-enable goal mode without goal subcommand help', featureListOfficial);
assertGate(fallback.mode === 'sks_goal_fallback', 'missing official goal must use SKS fallback', fallback);
emitGate('goal-mode:official-default', { official: official.mode, feature_list_official: featureListOfficial.mode, fallback: fallback.mode });
