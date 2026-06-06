export interface ZellijRightColumnGeometryPane {
  pane_id: string
  role: 'main' | 'dashboard' | 'worker' | 'unknown'
  geometry: { x: number | null; y: number | null; width: number | null; height: number | null } | null
}

export function evaluateZellijRightColumnGeometry(input: {
  panes: ZellijRightColumnGeometryPane[]
  visiblePaneCap: number
  tolerance?: number
}) {
  const tolerance = Math.max(0, Number(input.tolerance ?? 2))
  const main = input.panes.find((pane) => pane.role === 'main') || null
  const dashboard = input.panes.find((pane) => pane.role === 'dashboard') || null
  const workers = input.panes.filter((pane) => pane.role === 'worker')
  const workerGeometries = workers.map((pane) => pane.geometry).filter(Boolean) as NonNullable<ZellijRightColumnGeometryPane['geometry']>[]
  const baseX = workerGeometries[0]?.x
  const sameRightX = baseX == null ? null : workerGeometries.every((geometry) => geometry.x != null && Math.abs(geometry.x - baseX) <= tolerance)
  const rightOfMain = !main?.geometry ? null : workerGeometries.every((geometry) => {
    if (geometry.x == null || main.geometry?.x == null || main.geometry?.width == null) return false
    return geometry.x >= main.geometry.x + main.geometry.width - tolerance
  })
  const increasingY = workerGeometries.every((geometry, index) => {
    if (index === 0) return true
    const previous = workerGeometries[index - 1]
    return geometry.y != null && previous?.y != null && geometry.y > previous.y
  })
  const visibleCapOk = workers.length <= Math.max(0, Math.floor(Number(input.visiblePaneCap || 0)))
  const blockers = [
    ...(!main ? ['right_column_main_pane_missing'] : []),
    ...(!dashboard ? ['right_column_dashboard_missing'] : []),
    ...(sameRightX === false ? ['right_column_worker_x_range_mismatch'] : []),
    ...(rightOfMain === false ? ['right_column_workers_not_right_of_main'] : []),
    ...(increasingY === false ? ['right_column_workers_not_stacked_down'] : []),
    ...(visibleCapOk ? [] : ['right_column_visible_cap_exceeded'])
  ]
  return {
    schema: 'sks.zellij-right-column-layout-proof.v1',
    ok: blockers.length === 0,
    main_pane_id: main?.pane_id || null,
    dashboard_pane_id: dashboard?.pane_id || null,
    worker_pane_ids: workers.map((pane) => pane.pane_id),
    same_right_x: sameRightX,
    right_of_main: rightOfMain,
    increasing_y: increasingY,
    visible_cap_ok: visibleCapOk,
    blockers
  }
}
