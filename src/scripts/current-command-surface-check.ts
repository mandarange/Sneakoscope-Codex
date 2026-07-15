#!/usr/bin/env node
import fs from 'node:fs';
import { assertGate, emitGate, importDist, readText, root } from './sks-1-18-gate-lib.js';

const removed = ['team', 'mad-db', 'tmux', 'xai', 'swarm', 'agent'];
const removedDollar = ['$Agent', '$Team', '$MAD-DB', '$Swarm', '$ShadowClone', '$Kagebunshin'];
const removedHandlers = [
  'src/commands/team.ts',
  'src/core/commands/team-command.ts',
  'src/core/commands/team-legacy-observe-command.ts',
  'src/commands/mad-db.ts',
  'src/core/commands/mad-db-command.ts',
  'src/commands/tmux.ts',
  'src/cli/xai-command.ts',
  'src/core/commands/agent-command.ts',
  'src/core/agents/agent-command-surface.ts'
];

const [{ COMMANDS, COMMAND_ALIASES, commandNames }, { REMOVED_PUBLIC_COMMANDS }, routes, init] = await Promise.all([
  importDist('cli/command-registry.js'),
  importDist('core/doctor/retired-managed-residue-private.js'),
  importDist('core/routes.js'),
  importDist('core/init.js')
]);
const catalogNames = routes.COMMAND_CATALOG.map((entry: any) => entry.name);
const listedDollarCommands = routes.DOLLAR_COMMANDS.map((entry: any) => entry.command);
const listedSkillAliases = routes.DOLLAR_COMMAND_ALIASES.map((entry: any) => entry.app_skill);
const liteManifest = readText('src/core/routes/dollar-manifest-lite.ts');
const commandManifestLite = readText('src/cli/command-manifest-lite.ts');
const argsSource = readText('src/cli/args.ts');

assertGate(
  JSON.stringify([...REMOVED_PUBLIC_COMMANDS].sort()) === JSON.stringify([...removed].sort()),
  'internal cleanup tombstones must cover every retired public command without registering aliases',
  { expected_count: removed.length, observed_count: REMOVED_PUBLIC_COMMANDS.length }
);

for (const command of removed) {
  assertGate(!Object.hasOwn(COMMANDS, command), `removed command must not be registered: ${command}`);
  assertGate(!Object.hasOwn(COMMAND_ALIASES, command), `removed command must not redirect: ${command}`);
  assertGate(!commandNames().includes(command), `removed command must not be listed: ${command}`);
  assertGate(!catalogNames.includes(command), `removed command must not be in the command catalog: ${command}`);
  assertGate(!commandManifestLite.includes(`{ name: '${command}',`), `removed command must not remain in the lite manifest: ${command}`);
}
for (const command of removedDollar) {
  assertGate(!listedDollarCommands.includes(command), `removed dollar command must not be listed: ${command}`);
  assertGate(routes.routePrompt(`${command} fixture`) === null, `removed dollar command must not redirect: ${command}`);
  assertGate(!liteManifest.includes(`command: '${command}'`), `removed dollar command must not remain in the lite manifest: ${command}`);
}
for (const skill of ['$agent', '$team', '$mad-db', '$swarm', '$shadow-clone', '$kage-bunshin']) {
  assertGate(!listedSkillAliases.includes(skill), `removed skill alias must not be listed: ${skill}`);
  assertGate(!liteManifest.includes(`app_skill: '${skill}'`), `removed skill alias must not remain in the lite manifest: ${skill}`);
}
for (const file of removedHandlers) {
  assertGate(!fs.existsSync(`${root}/${file}`), `removed command handler must not remain: ${file}`);
}
assertGate(!argsSource.includes("'--agent',"), 'CLI value-flag parsing must not preserve the retired public scheduler flag');
const managedAgents = init.agentsBlockText();
assertGate(!managedAgents.includes('$From-Chat-IMG'), 'managed project guidance must not advertise an unregistered visual route name');
assertGate(!managedAgents.includes('$from-chat-img'), 'managed project guidance must not advertise the visual add-on skill as another execution alias');
assertGate(managedAgents.includes('from-chat-img'), 'managed project guidance must retain the Naruto visual add-on skill name');
assertGate(listedDollarCommands.includes('$Naruto') && listedDollarCommands.includes('$Work'), 'current execution surface must list the canonical workflow and its intended alias');
const narutoRoute = routes.ROUTES.find((entry: any) => entry.id === 'Naruto');
assertGate(
  JSON.stringify(narutoRoute?.dollarAliases || []) === JSON.stringify(['$Work']),
  'canonical official subagent route must have exactly one execution alias',
  { alias_count: narutoRoute?.dollarAliases?.length || 0 }
);
assertGate(routes.routePrompt('$Work fixture')?.id === 'Naruto', 'the intended execution alias must resolve to the canonical official subagent route');

emitGate('commands:current-surface-only', {
  removed_command_count: removed.length,
  removed_dollar_count: removedDollar.length,
  removed_handler_count: removedHandlers.length,
  canonical_execution_surface_count: 2
});
