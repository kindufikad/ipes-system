const ENGLISH_PROFANITY = [
  'ass', 'bastard', 'bitch', 'damn', 'idiot', 'lazy', 'leba', 'moron', 'shit', 'stupid', 'tebeda', 'worst',
];
const AMHARIC_LATIN_PROFANITY = ['ahya', 'chigram', 'chigaram', 'tebeda', 'eshsh', 'ደደብ', 'ሞኝ', 'ሰነፍ', 'አህያ', 'ቆሻሻ'];
const KEYBOARD_SEQUENCES = ['asdf', 'fdsa', 'qwer', 'rewq', 'zxcv', 'vcxz', 'poiuy', 'lkjh', 'mnbv'];
const VALIDATION_MESSAGE = 'እባክዎን አካዳሚያዊ እና ገንቢ አስተያየት ብቻ ያስገቡ። (Please enter constructive academic feedback without improper terms).';

const normalizeText = (text) => String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const getWords = (text) => normalizeText(text).split(/\s+/).filter(Boolean);
const isLetterWord = (word) => /[A-Za-z\u1200-\u137F]/u.test(word) && !/^\d+$/u.test(word);
const isGibberishWord = (word) => {
  const compact = word.toLowerCase().replace(/[^a-z\u1200-\u137F]/gu, '');
  if (!compact || !isLetterWord(compact)) return true;
  if (/(.)\1{3,}/u.test(compact)) return true;
  if (KEYBOARD_SEQUENCES.some((sequence) => compact.includes(sequence))) return true;
  return compact.length > 7 && !/[aeiouy\u1200-\u135A]/iu.test(compact);
};
const profanityPattern = new RegExp(`(^|[^A-Za-z\\u1200-\\u137F])(${[...ENGLISH_PROFANITY, ...AMHARIC_LATIN_PROFANITY].join('|')})(?=$|[^A-Za-z\\u1200-\\u137F])`, 'giu');
const hasProfanity = (text) => profanityPattern.test(normalizeText(text));

const validateEvaluationFeedback = (text) => {
  const value = normalizeText(text);
  const words = getWords(value);
  const meaningfulWords = words.filter((word) => isLetterWord(word) && !isGibberishWord(word));
  const hasGibberish = words.some((word) => isGibberishWord(word));
  const errors = [];

  profanityPattern.lastIndex = 0;
  if (hasProfanity(value) || hasGibberish || meaningfulWords.length < 3) errors.push(VALIDATION_MESSAGE);

  return {
    valid: errors.length === 0,
    errors,
    meaningfulWordCount: meaningfulWords.length,
    quality: errors.length || meaningfulWords.length < 6 ? 'Needs More Detail' : 'Good',
  };
};

const validateEvaluationFeedbackPair = (strengths, improvements) => {
  const strengthsResult = normalizeText(strengths) ? validateEvaluationFeedback(strengths) : { valid: true, errors: [], quality: 'Optional' };
  const improvementsResult = normalizeText(improvements) ? validateEvaluationFeedback(improvements) : { valid: true, errors: [], quality: 'Optional' };
  return {
    valid: strengthsResult.valid && improvementsResult.valid,
    strengths: strengthsResult,
    improvements: improvementsResult,
    errors: [...new Set([...strengthsResult.errors, ...improvementsResult.errors])],
  };
};

const sanitizeEvaluationFeedback = (text) => {
  const value = normalizeText(text);
  if (!value) return '';
  const replaced = value.replace(profanityPattern, '$1[Filtered]');
  const validation = validateEvaluationFeedback(value);
  profanityPattern.lastIndex = 0;
  const containsProfanity = profanityPattern.test(value);
  profanityPattern.lastIndex = 0;
  return validation.valid ? replaced : (containsProfanity ? replaced : '');
};

module.exports = {
  AMHARIC_LATIN_PROFANITY,
  ENGLISH_PROFANITY,
  VALIDATION_MESSAGE,
  sanitizeEvaluationFeedback,
  validateEvaluationFeedback,
  validateEvaluationFeedbackPair,
};
