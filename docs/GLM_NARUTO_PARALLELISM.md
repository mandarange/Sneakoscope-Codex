# GLM Naruto Parallelism

GLM Naruto is the OpenRouter `z-ai/glm-5.2` extreme parallel modification path. Its parallelism proof is stage-based, not just worker-count based.

4.0.14 records:

- `stage-timeline.jsonl` with start/end events for bounded stage jobs.
- `parallelism-summary.json` with `overlap_ratio = sum_job_duration_ms / wall_clock_ms`.
- `critical-path.json` and `speed-diagnosis.md` to show which phase dominates wall clock.

The final apply remains single-threaded. Patch generation, worktree materialization, candidate gate, verifier, and repair generation are measured separately. Multi-job stages with `overlap_ratio <= 1.1` are marked with `glm_parallelism_not_effective:<stage>`.
