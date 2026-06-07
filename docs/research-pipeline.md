# SKS Research Pipeline

SKS Research is a read-only route for source-backed discovery and implementation handoff. It writes only mission-local artifacts under `.sneakoscope/missions/<id>/`; repository source, package metadata, docs, config, and generated harness files remain out of scope during a normal research run.

As of 2.0.13, every research mission is created with `research-quality-contract.json`. The default contract requires at least 12 total sources, 5 covered source layers, 2 counterevidence sources, 8 key claims, 6 triangulated claims, 8 implementation blueprint sections, 4 falsification cases, 5 experiment steps, and a 2200-word research report before the gate can pass.

The native run now also writes `research-work-graph.json` and passes that graph into the native agent orchestrator as a read-only Naruto work graph. This makes the source quality, claim matrix, falsification, synthesis, blueprint, experiment, replication, final review, and gate-close stages visible to the runtime without allowing source mutation.

Fast checks:

```sh
npm run research:quality-gates
npm run codex-sdk:research-pipeline
sks research run latest --mock --json
```
