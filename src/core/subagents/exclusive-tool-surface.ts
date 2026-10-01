import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js'
import type { SubagentToolSurface } from './model-policy.js'

/**
 * Computer Use and the browser each drive ONE shared GUI: one screen with one
 * pointer and keyboard focus, one browser session (the in-app Browser and the
 * Chrome extension count as the same surface because a router can swap them).
 * Two children on the same surface only repeat each other's clicks, so the
 * surface is single-owner. Image generation is a separate tool and not exclusive.
 *
 * The surface is read from the managed operator role, never from free text:
 * ordinary coding slices mention websites and browsers all the time.
 */
export type ExclusiveToolSurface = Extract<SubagentToolSurface, 'computer_use' | 'browser'>

const SURFACE_OF_ROLE: Readonly<Record<string, ExclusiveToolSurface>> = {
  computer_use_operator: 'computer_use',
  browser_use_operator: 'browser'
}

export const EXCLUSIVE_SURFACE_LABEL: Readonly<Record<ExclusiveToolSurface, string>> = {
  computer_use: 'Computer Use',
  browser: 'Browser'
}

/** The surface a role name owns, through every alias and spelling of the managed operator roles. */
export function exclusiveSurfaceOfRole(name: unknown): ExclusiveToolSurface | null {
  const role = managedOfficialSubagentRoleByName(String(name ?? '').trim())
  return role ? SURFACE_OF_ROLE[role.codex_name] ?? null : null
}

/** The surfaces owned when every suggested role is a surface operator, else none (mixed work keeps its fan-out hint). */
export function exclusiveSurfacesOfOnlyRoles(roles: readonly unknown[] | null | undefined): ExclusiveToolSurface[] {
  const surfaces = (roles || []).map(exclusiveSurfaceOfRole)
  if (!surfaces.length || surfaces.some((surface) => surface === null)) return []
  return [...new Set(surfaces as ExclusiveToolSurface[])]
}
