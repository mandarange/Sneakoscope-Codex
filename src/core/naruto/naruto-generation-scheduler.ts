import type { NarutoWorkerRole } from './naruto-role-policy.js'
import type { NarutoWorkItem } from './naruto-work-item.js'

export interface NarutoGeneration {
  generation_id: string
  work_item_id: string
  role: NarutoWorkerRole | string
  status: 'active' | 'completed' | 'failed'
  started_tick: number
  completed_tick: number | null
}

export function createNarutoGeneration(workItem: NarutoWorkItem, index: number, tick: number): NarutoGeneration {
  return {
    generation_id: `NG-${String(index).padStart(6, '0')}`,
    work_item_id: workItem.id,
    role: workItem.required_role,
    status: 'active',
    started_tick: tick,
    completed_tick: null
  }
}

export function completeNarutoGeneration(generation: NarutoGeneration, tick: number, failed = false): NarutoGeneration {
  return {
    ...generation,
    status: failed ? 'failed' : 'completed',
    completed_tick: tick
  }
}

