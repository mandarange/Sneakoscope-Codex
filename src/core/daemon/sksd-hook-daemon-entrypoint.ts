#!/usr/bin/env node
// Entrypoint for the detached sksd hook daemon process (spawned by
// spawnSksdHookDaemonDetached). Not invoked directly by users.
import { startSksdHookDaemon } from './sksd-hook-daemon.js';
import { daemonSpawnEnv } from './sksd-hook-env.js';
import { evaluateHookPayloadOnce } from '../hooks-runtime.js';

// The spawner already scrubbed per-process markers; a daemon started any other
// way scrubs them too before it serves a single decision.
const scrubbed = daemonSpawnEnv(process.env);
for (const key of Object.keys(process.env)) if (!(key in scrubbed)) delete process.env[key];

const root = process.argv[2];
if (!root) {
  process.stderr.write('sksd-hook-daemon-entrypoint: root argument required\n');
  process.exit(1);
}

await startSksdHookDaemon(root, async (name, payload) => evaluateHookPayloadOnce(name, payload, { root }), { exitOnRetire: true });
