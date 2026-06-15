# Skill Integrity

SKS core skills are treated as product contracts, not editable setup output.

SKS 3.1.8 adds a content-addressed manifest for the eight immutable core route skills:

- `loop`
- `naruto`
- `qa-loop`
- `research`
- `dfix`
- `image-ux-review`
- `computer-use`
- `init-deep`

Setup, update, and doctor flows may install a missing managed copy or restore a corrupted managed copy from the manifest. They must not overwrite user-authored skill collisions.

Project skill names are canonicalized before duplicate detection. Variants such as a dollar-prefixed Loop skill, `Loop`, `loop.md`, and `loop/SKILL.md` all map to `loop`. SKS-managed duplicates can be quarantined under `.sneakoscope/quarantine/skills/<canonical>/<timestamp>/`; user-authored duplicates are reported unless the operator explicitly opts into user duplicate quarantine.

Relevant gates:

```bash
npm run core-skill:manifest
npm run core-skill:immutable-sync
npm run core-skill:no-drift
npm run skill:dedupe-blackbox
```
