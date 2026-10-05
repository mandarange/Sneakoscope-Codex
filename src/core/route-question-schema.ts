import { buildQaLoopQuestionSchema } from './qa-loop.js';
import { buildMadSksQuestionSchema, buildQuestionSchema } from './questions.js';

/**
 * The question schema a route asks before it runs. It lives apart from
 * questions.ts so that request intake, which every mission and hook touches,
 * does not load the QA-LOOP route with it.
 */
export function buildQuestionSchemaForRoute(route: any, prompt: any) {
  if (String(route?.id || '') === 'QALoop') return buildQaLoopQuestionSchema(prompt);
  if (String(route?.id || '') === 'MadSKS') return buildMadSksQuestionSchema(prompt);
  return buildQuestionSchema(prompt);
}
