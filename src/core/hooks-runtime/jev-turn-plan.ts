import { consultJevOptions, type JevOptionsDecision } from '../decisions/integration.js'
import type { OptionQuestion } from '../decisions/types.js'
import { readImagegenConfig } from '../imagegen/imagegen-config.js'
import { dollarCommand, routePrompt, stripVisibleDecisionAnswerBlocks } from '../routes.js'
import { classifyTaskProfile } from '../runtime/task-profile.js'

/**
 * One Jev call per submitted prompt, made before SKS routes it. In Jev mode it
 * answers, together:
 * - which SKS pipeline fits the prompt (replacing the keyword router when
 *   Jev is confident; explicit `$commands` always win),
 * - the model tier of the turn (the reasoning hint / default child seal),
 * - whether the turn makes an image, when the custom image model mode is on.
 * Jev off, a greeting, or an unconfident answer keeps the deterministic path.
 */

export const JEV_ROUTE_OPTIONS = Object.freeze({
  answer: { routeId: 'Answer', summary: 'Explain, answer a question, review, or discuss. No file changes.' },
  implement: { routeId: 'Naruto', summary: 'Implement, fix, refactor, configure, or otherwise change code or files. SKS orchestrates child agents.' },
  tiny_fix: { routeId: 'DFix', summary: 'One tiny direct edit: a typo, one string, or one obvious line.' },
  research: { routeId: 'Research', summary: 'Investigate an open question with hypotheses and sources. No code change.' },
  experiment: { routeId: 'AutoResearch', summary: 'Run experiments or benchmarks to improve a measurable metric.' },
  web_search: { routeId: 'SuperSearch', summary: 'Look up current facts, docs, or news on the web. No code change.' },
  qa_loop: { routeId: 'QALoop', summary: 'Run end-to-end QA of an app in a browser and fix what fails.' },
  presentation: { routeId: 'PPT', summary: 'Make a presentation, deck, or slides.' },
  ux_review: { routeId: 'ImageUXReview', summary: 'Review UI/UX from screenshots with generated callout images.' },
  database: { routeId: 'DB', summary: 'Database schema, queries, migrations, or data changes.' },
  computer_use: { routeId: 'ComputerUse', summary: 'Operate native desktop apps on this Mac.' },
  seo: { routeId: 'SEOGEOOptimizer', summary: "Improve a site's search or generative-engine visibility." }
} as const)

export type JevRouteOption = keyof typeof JEV_ROUTE_OPTIONS

const IMAGE_TASK_RE = /\b(images?|pictures?|photos?|illustrations?|icons?|logos?|banners?|posters?|thumbnails?|mockups?|renders?|drawings?|stickers?|wallpapers?|avatars?)\b|이미지|그림|사진|일러스트|아이콘|로고|배너|포스터|썸네일|시안|렌더|스티커|배경화면|아바타/i
const IMAGE_ROUTES = new Set(['PPT', 'ImageUXReview'])

export interface JevTurnPlan {
  decision: JevOptionsDecision
  baselineRouteId: string | null
  routeId: string | null
  routeOverride: { text: string; routeId: string } | null
  customImageModel: string | null
  imageNeeded: boolean | null
}

function routeQuestion(): OptionQuestion {
  return {
    id: 'route',
    instructions: 'Choose the SKS pipeline for state.task by what the user wants done, not by keywords. A question about code is answer; a request to change code or files is implement or tiny_fix.',
    options: Object.fromEntries(Object.entries(JEV_ROUTE_OPTIONS).map(([id, row]) => [id, row.summary]))
  }
}

function imageQuestion(): OptionQuestion {
  return {
    id: 'image_need',
    instructions: 'Will finishing state.task make or edit an image (an illustration, icon, photo, banner, slide visual, UI mockup, or annotated screenshot)?',
    options: {
      yes: 'The task produces or edits at least one image.',
      no: 'The task needs no generated or edited image.'
    }
  }
}

export async function planJevTurn(root: string, rawPrompt: string, env: NodeJS.ProcessEnv = process.env): Promise<JevTurnPlan | null> {
  const prompt = stripVisibleDecisionAnswerBlocks(rawPrompt).trim()
  if (!prompt) return null
  const explicit = Boolean(dollarCommand(prompt)) || /^\$?plan\b/i.test(prompt)
  // Greetings and acknowledgements never reach Jev.
  if (!explicit && classifyTaskProfile(prompt) === 'passthrough') return null
  const baselineRouteId = explicit ? null : routePrompt(prompt)?.id || null
  const imagegen = await readImagegenConfig(env).catch(() => null)
  const customImageModel = imagegen?.mode === 'openrouter' ? imagegen.openrouter_model : null
  const questions: OptionQuestion[] = []
  if (!explicit) questions.push(routeQuestion())
  if (customImageModel) questions.push(imageQuestion())
  const decision = await consultJevOptions({
    root,
    workflowId: 'turn',
    goal: prompt,
    questions,
    tierRoleId: 'turn',
    ...(baselineRouteId ? { facts: { keyword_router_guess: baselineRouteId } } : {}),
    env
  })
  const choice = decision.choices.route as JevRouteOption | undefined
  const routeId = choice && JEV_ROUTE_OPTIONS[choice] ? JEV_ROUTE_OPTIONS[choice].routeId : null
  const imageChoice = decision.choices.image_need
  return {
    decision,
    baselineRouteId,
    routeId,
    routeOverride: routeId && routeId !== baselineRouteId ? { text: prompt, routeId } : null,
    customImageModel,
    imageNeeded: imageChoice === 'yes' ? true : imageChoice === 'no' ? false : null
  }
}

/**
 * The custom image model instruction, only on turns that make images: Jev said
 * so, or (without a confident Jev answer) the prompt or route is about images.
 */
export function customImageModeLine(plan: JevTurnPlan | null, rawPrompt: string, routeId: string | null): string {
  if (!plan?.customImageModel) return ''
  const imageTurn = plan.imageNeeded ?? (IMAGE_TASK_RE.test(rawPrompt) || IMAGE_ROUTES.has(String(routeId || '')))
  if (!imageTurn) return ''
  return `SKS image mode: the custom OpenRouter image model ${plan.customImageModel} is on. Make every image with \`sks imagegen generate --prompt <text> --out <file>\` (add \`--reference <file>\` to edit an image); it goes through the SKS Desktop Bridge and writes evidence next to the file. Do not use the built-in image tool this turn.`
}
