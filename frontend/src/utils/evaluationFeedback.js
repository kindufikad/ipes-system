const ENGLISH_PROFANITY = [
  'ass', 'bastard', 'bitch', 'damn', 'idiot', 'lazy', 'moron', 'shit', 'stupid', 'worst',
];
const AMHARIC_PROFANITY = ['ደደብ', 'ሞኝ', 'ሰነፍ', 'አህያ', 'ቆሻሻ'];
const KEYBOARD_SEQUENCES = ['asdf', 'fdsa', 'qwer', 'rewq', 'zxcv', 'poiuy', 'lkjh'];

const normalizeText = (text) => String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const getWords = (text) => normalizeText(text).split(/\s+/).filter(Boolean);
const isLetterWord = (word) => /[A-Za-z\u1200-\u137F]/u.test(word) && !/^\d+$/.test(word);
const isGibberishWord = (word) => {
  const compact = word.toLowerCase().replace(/[^a-z\u1200-\u137F]/gu, '');
  if (!compact || !isLetterWord(compact)) return true;
  if (/(.)\1{3,}/u.test(compact)) return true;
  if (KEYBOARD_SEQUENCES.some((sequence) => compact.includes(sequence))) return true;
  return compact.length > 7 && !/[aeiouy\u1200-\u135A]/iu.test(compact);
};
const hasProfanity = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  return [...ENGLISH_PROFANITY, ...AMHARIC_PROFANITY].some((word) => new RegExp(`(^|[\\s.,!?])${word}($|[\\s.,!?])`, 'iu').test(normalized));
};

export const validateEvaluationFeedback = (text) => {
  const value = normalizeText(text);
  const words = getWords(value);
  const meaningfulWords = words.filter((word) => isLetterWord(word) && !isGibberishWord(word));
  const errors = [];

  if (hasProfanity(value)) errors.push('Please provide constructive and professional feedback.');
  if (words.some((word) => /(.)\1{3,}/u.test(word.replace(/[^A-Za-z\u1200-\u137F]/gu, '')) || KEYBOARD_SEQUENCES.some((sequence) => word.toLowerCase().includes(sequence)))) {
    errors.push('Please replace random or repeated characters with meaningful feedback.');
  }
  if (meaningfulWords.length < 3) errors.push('Please provide at least 3 meaningful words.');

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    meaningfulWordCount: meaningfulWords.length,
    quality: errors.length || meaningfulWords.length < 6 ? 'Needs More Detail' : 'Good',
  };
};

export const validateEvaluationFeedbackPair = (strengths, improvements) => {
  const strengthsResult = validateEvaluationFeedback(strengths);
  const improvementsResult = validateEvaluationFeedback(improvements);
  return {
    valid: strengthsResult.valid && improvementsResult.valid,
    strengths: strengthsResult,
    improvements: improvementsResult,
    errors: [...new Set([...strengthsResult.errors, ...improvementsResult.errors])],
  };
};
