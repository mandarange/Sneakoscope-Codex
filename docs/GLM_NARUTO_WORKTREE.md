# GLM Naruto Worktree Isolation

GLM Naruto has two honest isolation modes:

- `patch-envelope-only`: workers return patch envelopes and never write the main workspace.
- `git-worktree`: each patch worker gets a temporary git worktree under `.sneakoscope/glm-naruto/<mission_id>/worktrees/<worker_id>`.

When `--worktree` is requested outside a usable git repository, GLM Naruto blocks with `glm_naruto_worktree_not_implemented_or_unavailable`. It falls back to patch-envelope-only only when `--allow-patch-envelope-fallback` is explicitly present.

Workers still ask `z-ai/glm-5.2` for patches. The patch is applied inside the worker worktree, exported back as a diff envelope, and then the parent process performs deterministic gates, scoring, merge planning, and the single final apply transaction.
