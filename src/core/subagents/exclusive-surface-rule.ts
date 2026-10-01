/**
 * The single-owner rule for GUI tool surfaces as prose, with no imports so the
 * route policy, the spawn contract, and the delegation prompt can all use one
 * wording without pulling in the role catalog. The surfaces and their gate are in
 * exclusive-tool-surface.ts and hooks-runtime/exclusive-gui-surface-gate.ts.
 */

/** Parent-facing rule: rendered in the delegation prompt, the route policy, and the spawn contract. */
export const EXCLUSIVE_SURFACE_RULE = 'Computer Use and browser (the in-app Browser or Chrome) are exclusive GUI surfaces: each is one screen or browser session with one pointer and keyboard focus. At most one child may operate a surface at a time, so put all work for a surface in one slice handled by one `computer_use_operator` or `browser_use_operator` child, or run its slices strictly one after another once the previous child has finished. Never give two children the same or overlapping surface task, and never do that surface work in the parent while its child runs. Other children work without the surface and use the owner\'s returned evidence. Image generation is not exclusive.'

/** The same rule from a child's side. */
export const EXCLUSIVE_SURFACE_CHILD_RULE = 'If your slice holds Computer Use or the browser you are its only owner: finish the whole surface task in this thread and return the evidence; do not assume a sibling shares the surface.'

/** One line for the per-turn route policy and the spawn contract, where the full rule would repeat the delegation prompt. */
export const EXCLUSIVE_SURFACE_SPAWN_LINE = 'Computer Use and browser are exclusive GUI surfaces: one `computer_use_operator` or `browser_use_operator` child per surface at a time, with all of that surface\'s work in one slice. The SKS PreToolUse hook denies a second concurrent spawn of the same operator role.'
