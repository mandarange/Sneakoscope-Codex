import test from 'node:test';
import assert from 'node:assert/strict';
import { detectResponseLanguage, localizedFinalizationReason, responseLanguageInstruction } from '../../src/core/language-preference.mjs';
import { promptPipelineContext, dfixQuickContext } from '../../src/core/pipeline.mjs';

test('language preference detects Korean prompts even with conditional English wording', () => {
  const result = detectResponseLanguage('한국어로 물었으면 한국어로, 영어로 물었으면 영어로 나오게 해줘');
  assert.equal(result.code, 'ko');
});

test('language preference honors explicit English response override', () => {
  const result = detectResponseLanguage('이번 결과는 영어로 답해줘');
  assert.equal(result.code, 'en');
});

test('language preference honors explicit Korean response override in English prompt', () => {
  const result = detectResponseLanguage('Please respond in Korean and keep commands as-is.');
  assert.equal(result.code, 'ko');
});

test('language preference detects English prompts', () => {
  const result = detectResponseLanguage('Please fix the final response summary language.');
  assert.equal(result.code, 'en');
});

test('pipeline contexts include language guidance for normal and light routes', () => {
  assert.match(promptPipelineContext('한국어로 요약해줘'), /한국어/);
  assert.match(dfixQuickContext('Please update this label'), /primarily English/);
});

test('localized stop reasons follow the prompt language', () => {
  assert.match(localizedFinalizationReason('honest_mode_missing', '한국어로 설명해줘'), /한국어/);
  assert.match(localizedFinalizationReason('completion_summary_missing', 'Please explain in English'), /final completion summary/);
});
