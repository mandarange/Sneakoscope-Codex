# GLM Stability And Loop Guard

GLM direct runs use a terminal state controller and hard speed limits.

## Speed Limits

- `max_turns`: 2
- `max_tool_rounds`: 0
- `max_wall_clock_ms`: 90000
- `request_timeout_ms`: 45000
- `idle_timeout_ms`: 15000
- `max_no_progress_iterations`: 1
- `max_repeated_output`: 1

Terminal phases are `completed`, `blocked`, `failed`, `cancelled`, and `timeout`. Once a run reaches a terminal phase, the controller refuses to transition back to request or streaming phases.

Each run writes:

- `.sneakoscope/glm/runs/<run_id>/run-state.json`
- `.sneakoscope/glm/runs/<run_id>/termination.json`
- `.sneakoscope/glm/runs/<run_id>/loop-guard.json`
- `.sneakoscope/glm/runs/<run_id>/context-omissions.json`
