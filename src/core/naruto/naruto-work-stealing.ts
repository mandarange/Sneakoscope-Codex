import type { NarutoWorkItem } from './naruto-work-item.js'

export interface NarutoWorkStealDecision {
  schema: 'sks.naruto-work-stealing.v1'
  stolen: boolean
  work_item_id: string | null
  from_queue: string
  to_slot: string
}

export function stealNarutoWork(queue: NarutoWorkItem[], input: { fromQueue?: string; toSlot?: string } = {}): NarutoWorkStealDecision {
  const item = queue.shift() || null
  return {
    schema: 'sks.naruto-work-stealing.v1',
    stolen: Boolean(item),
    work_item_id: item?.id || null,
    from_queue: input.fromQueue || 'pending',
    to_slot: input.toSlot || 'idle-slot'
  }
}

