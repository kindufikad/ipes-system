const collectText = (rows, fields) => [...new Set((rows || [])
  .flatMap((row) => fields.map((field) => row?.[field]))
  .map((value) => String(value || '').trim())
  .filter(Boolean))]
  .map((value) => value.length > 320 ? `${value.slice(0, 317)}...` : value)
  .slice(0, 30);

const limitText = (values, maxLength = 4000) => {
  let remaining = maxLength;
  const limited = [];
  for (const value of values) {
    if (!remaining) break;
    const part = value.slice(0, remaining);
    limited.push(part);
    remaining -= part.length;
  }
  return limited;
};

const fallbackSummary = ({ strengths, improvements, comments }) => {
  const cleanExcerpts = (values) => values.slice(0, 3)
    .map((value) => value.replace(/[.!?]+/g, ',').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('; ');
  const strengthText = cleanExcerpts(strengths);
  const improvementText = cleanExcerpts(improvements);
  const commentText = cleanExcerpts(comments);
  const firstSentence = strengthText
    ? `Feedback highlights strengths such as ${strengthText}.`
    : 'The submitted feedback provides useful input on the instructor’s teaching practice.';
  const secondSentence = improvementText
    ? `Areas for improvement include ${improvementText}.`
    : commentText
      ? `Additional feedback includes ${commentText}.`
      : 'Continue building on these practices and review future feedback for emerging improvement opportunities.';
  return `${firstSentence} ${secondSentence}`;
};

const hasConfiguredProvider = () => {
  const provider = String(process.env.AI_PROVIDER || 'local').trim().toLowerCase();
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (provider === 'local') return Boolean(process.env.LOCAL_LLM_URL);
  return false;
};

const summarizeInstructorFeedback = async ({ studentRows = [], peerRows = [], deptHeadRows = [] } = {}) => {
  const strengths = limitText(collectText([...studentRows, ...peerRows, ...deptHeadRows], ['strengths']));
  const improvements = limitText(collectText(studentRows, ['improvements'])
    .concat(collectText(deptHeadRows, ['weaknesses']))
    .concat(collectText(peerRows, ['suggestions'])));
  const comments = limitText(collectText(studentRows, ['feedback'])
    .concat(collectText(deptHeadRows, ['feedback']))
    .concat(collectText(peerRows, ['feedback'])));

  if (!strengths.length && !improvements.length && !comments.length) {
    return { summary: '', source: 'none' };
  }

  const prompt = [
    'Summarize these instructor performance feedback comments into 2 clear professional sentences:',
    `Strengths: ${strengths.join(' | ') || 'No explicit strengths were provided.'}`,
    `Areas for Improvement: ${improvements.join(' | ') || 'No explicit improvement areas were provided.'}`,
    `Additional Comments: ${comments.join(' | ') || 'None.'}`,
  ].join('\n');
  const input = { comments: prompt, feedback: prompt };

  if (hasConfiguredProvider()) {
    try {
      const { generateInsight } = require('./aiService');
      const result = await generateInsight('summarize_feedback', input);
      const summary = String(result?.summary || '').trim();
      if (summary && summary !== 'No additional insight was generated.') {
        return { summary, source: result?.provider || 'llm' };
      }
    } catch (error) {
      console.warn('Instructor feedback summarization failed; using the local summary:', error?.message || error);
    }
  }

  return { summary: fallbackSummary({ strengths, improvements, comments }), source: 'local' };
};

module.exports = { summarizeInstructorFeedback };
