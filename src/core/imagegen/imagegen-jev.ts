import { consultJevOptions } from '../decisions/integration.js'
import type { OptionQuestion } from '../decisions/types.js'
import { OPENROUTER_ASPECT_RATIOS } from './openrouter-images.js'

/**
 * Jev picks the image parameters a caller left open, from the prompt alone,
 * in one Decisions call, so the model does not spend a turn on them. Jev off
 * or an unconfident answer returns nulls and the image path keeps its own
 * defaults (the model's native aspect, medium quality).
 */

const ASPECT_SUMMARIES: Readonly<Record<(typeof OPENROUTER_ASPECT_RATIOS)[number], string>> = Object.freeze({
  '1:1': 'Square: icons, avatars, logos, product shots, social posts.',
  '4:5': 'Slightly tall: portrait social posts and cards.',
  '5:4': 'Slightly wide: prints and framed photos.',
  '3:4': 'Portrait: posters, book covers, full-body people.',
  '4:3': 'Classic landscape: UI screens, presentations in 4:3, photos.',
  '2:3': 'Tall portrait photos and prints.',
  '3:2': 'Landscape photos and camera-style scenes.',
  '9:16': 'Phone screen: mobile UI, stories, vertical video frames.',
  '16:9': 'Widescreen: slides, hero banners, desktop UI, thumbnails.',
  '21:9': 'Ultra-wide: cinematic banners and page headers.'
})

const QUALITY_SUMMARIES = Object.freeze({
  low: 'Fast draft: quick iteration, rough concepts, many variants.',
  medium: 'Normal quality for most requests.',
  high: 'Final asset: hero images, fine detail, legible text, print.'
})

export interface ImagegenJevParameters {
  called: boolean
  aspectRatio: string | null
  quality: 'low' | 'medium' | 'high' | null
  reason: string
}

export function imagegenParameterQuestions(hasReference: boolean, ask: { aspect?: boolean; quality?: boolean } = {}): OptionQuestion[] {
  const questions: OptionQuestion[] = []
  // An edit keeps the reference image's own proportions.
  if (!hasReference && ask.aspect !== false) {
    questions.push({
      id: 'image_aspect',
      instructions: 'Choose the aspect ratio the requested image should have, from what state.task says the image is for.',
      options: ASPECT_SUMMARIES
    })
  }
  if (ask.quality !== false) questions.push({
    id: 'image_quality',
    instructions: 'Choose the image quality level state.task needs. Prefer the cheaper level unless the task asks for a final or detailed asset.',
    options: QUALITY_SUMMARIES
  })
  return questions
}

export async function decideImagegenParameters(input: {
  root: string
  prompt: string
  hasReference: boolean
  /** Leave out a question the caller already answered. */
  ask?: { aspect?: boolean; quality?: boolean }
  env?: NodeJS.ProcessEnv
}): Promise<ImagegenJevParameters> {
  const decision = await consultJevOptions({
    root: input.root,
    workflowId: 'imagegen',
    goal: input.prompt,
    questions: imagegenParameterQuestions(input.hasReference, input.ask),
    ...(input.env ? { env: input.env } : {})
  })
  const aspect = decision.choices.image_aspect || null
  const quality = decision.choices.image_quality
  return {
    called: decision.called,
    aspectRatio: aspect && (OPENROUTER_ASPECT_RATIOS as readonly string[]).includes(aspect) ? aspect : null,
    quality: quality === 'low' || quality === 'medium' || quality === 'high' ? quality : null,
    reason: decision.reason
  }
}
