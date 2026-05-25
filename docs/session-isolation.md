# Session Isolation

SKS 1.17.0 namespaces agent sessions by project root hash and mission id.

The project namespace format is `sks-<rootHash>`, and the mission namespace format is `sks-<rootHash>-<missionId>`. Tmux prefixes, temp dirs, lock dirs, agent session ids, and mission artifacts include that namespace so two projects with the same mission id cannot collide.

Each agent mission writes `project-session-namespace.json`; janitor cleanup refuses to act on paths that do not include the active project hash.
