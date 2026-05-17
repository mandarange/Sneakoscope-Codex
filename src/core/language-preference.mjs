const HANGUL_RE = /[\u3131-\u318e\uac00-\ud7a3]/gu;
const LATIN_WORD_RE = /[A-Za-z][A-Za-z']*/g;

const KOREAN_OVERRIDE_PATTERNS = [
  /\b(?:answer|respond|reply|write|explain|summari[sz]e|use)\s+(?:in\s+)?(?:korean|hangul)\b/i,
  /(?:한국어|한글)(?:로|으로)?\s*(?:답|응답|말|작성|설명|정리|써|해줘|해주세요)/i,
  /(?:답|응답|말|작성|설명|정리|써)\S{0,12}(?:한국어|한글)(?:로|으로)?/i
];

const ENGLISH_OVERRIDE_PATTERNS = [
  /\b(?:answer|respond|reply|write|explain|summari[sz]e|use)\s+(?:in\s+)?english\b/i,
  /영어(?:로|으로)?\s*(?:답|응답|말|작성|설명|정리|써|해줘|해주세요)/i,
  /(?:답|응답|말|작성|설명|정리|써)\S{0,12}영어(?:로|으로)?/i
];

function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function hasExplicitOverride(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectResponseLanguage(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) {
    return { code: 'unknown', label: 'unknown', confidence: 0, reason: 'empty_prompt' };
  }

  const koreanOverride = hasExplicitOverride(text, KOREAN_OVERRIDE_PATTERNS);
  const englishOverride = hasExplicitOverride(text, ENGLISH_OVERRIDE_PATTERNS);
  if (koreanOverride && !englishOverride) {
    return { code: 'ko', label: 'Korean', confidence: 1, reason: 'explicit_korean_override' };
  }
  if (englishOverride && !koreanOverride) {
    return { code: 'en', label: 'English', confidence: 1, reason: 'explicit_english_override' };
  }

  const hangulCount = countMatches(text, HANGUL_RE);
  const latinWords = String(text || '').match(LATIN_WORD_RE) || [];
  const latinCharCount = latinWords.join('').length;
  const totalLanguageChars = hangulCount + latinCharCount;
  const hangulRatio = totalLanguageChars > 0 ? hangulCount / totalLanguageChars : 0;

  if (hangulCount >= 8 || (hangulCount >= 2 && hangulRatio >= 0.08)) {
    return {
      code: 'ko',
      label: 'Korean',
      confidence: Math.min(0.98, 0.62 + hangulRatio),
      reason: 'hangul_dominant_or_present'
    };
  }

  if (latinWords.length >= 2) {
    return {
      code: 'en',
      label: 'English',
      confidence: Math.min(0.95, 0.55 + latinWords.length / 40),
      reason: 'latin_words_present'
    };
  }

  return { code: 'unknown', label: 'unknown', confidence: 0.2, reason: 'insufficient_language_signal' };
}

export function responseLanguageInstruction(prompt = '') {
  const language = detectResponseLanguage(prompt);
  if (language.code === 'ko') {
    return [
      '응답 언어: 사용자 요청은 주로 한국어입니다.',
      '진행 업데이트, 사용자에게 보이는 요약, 최종 완료 요약, SKS 솔직모드는 한국어로 작성하세요.',
      '코드, 명령어, 파일 경로, 패키지명, API명, 인용 원문은 원래 언어 그대로 유지하세요.',
      '이후 사용자 메시지가 다른 응답 언어를 명시하면 가장 최근의 명시적 언어 요청을 따르세요.'
    ].join(' ');
  }
  if (language.code === 'en') {
    return [
      'Response language: the user prompt is primarily English.',
      'Write assistant progress updates, user-visible summaries, final completion summary, and SKS Honest Mode in English.',
      'Preserve code, commands, file paths, package names, API names, and quoted source text in their original language.',
      'If a later user message explicitly asks for a different response language, follow the latest explicit language request.'
    ].join(' ');
  }
  return [
    'Response language: match the user prompt language when clear.',
    'If the prompt language remains ambiguous, use concise English while preserving code, commands, file paths, package names, API names, and quoted source text as-is.'
  ].join(' ');
}

export function localizedFinalizationReason(kind, prompt = '') {
  const language = detectResponseLanguage(prompt);
  const korean = language.code === 'ko';
  if (kind === 'completion_summary_missing') {
    return korean
      ? 'SKS 최종 완료 요약(completion summary)이 필요합니다. 마치기 전에 무엇을 했는지, 사용자/레포에 무엇이 바뀌었는지, 무엇을 검증했는지, 남은 gap이 무엇인지 SKS 솔직모드와 함께 한국어로 설명하세요.'
      : 'SKS final completion summary is required before finishing. Explain what was done, what changed for the user/repo, what was verified, and any remaining gaps before or alongside SKS Honest Mode.';
  }
  if (kind === 'honest_loopback') {
    return korean
      ? 'SKS 솔직모드에서 해결되지 않은 gap이 발견되었습니다. decision-contract.json 기준의 post-ambiguity execution phase에서 계속 진행하고, gap을 고친 뒤 검증을 다시 실행하고, TriWiki를 refresh/validate한 다음 최종 솔직모드를 다시 시도하세요.'
      : 'SKS Honest Mode found unresolved gaps. Continue from the post-ambiguity execution phase using decision-contract.json, fix them, rerun verification, refresh/validate TriWiki, then retry final Honest Mode.';
  }
  return korean
    ? '마치기 전에 SKS 솔직모드가 필요합니다. 실제 목표를 다시 확인하고, 증거/테스트를 검증하고, 남은 gap을 솔직히 적은 뒤 최종 답변을 한국어로 제공하세요. 짧은 "SKS 솔직모드" 또는 "솔직모드" 섹션을 포함하세요.'
    : 'SKS Honest Mode is required before finishing. Re-check the actual goal, verify evidence/tests, state gaps honestly, and only then provide the final answer. Include a short "SKS Honest Mode" or "솔직모드" section.';
}
