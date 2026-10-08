const crypto = require('crypto');
const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getRoleBasedInsights, getDeptHeadAiInsights } = require('../controllers/aiInsightsController');

const router = express.Router();
const cache = new Map();
const CACHE_TTL_MS = Math.max(30_000, Number(process.env.AI_CACHE_TTL_MS || 300_000));
const MAX_INPUT_LENGTH = 20_000;
const ALLOWED_ROLES = ['student', 'instructor', 'lab_assistant', 'dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin', 'systemadmin'];
const ACTIONS = new Set(['validate_feedback', 'summarize_feedback', 'career_growth', 'anomalies', 'mentorship', 'executive_summary', 'strategic_trends', 'audit_security']);

const provider = String(process.env.AI_PROVIDER || 'local').trim().toLowerCase();
const json = (value) => {
  try { return JSON.parse(value); } catch { return null; }
};
const normalizeResult = (value) => ({
  title: String(value?.title || 'AI insight'),
  summary: String(value?.summary || 'No additional insight was generated.'),
  bullets: Array.isArray(value?.bullets) ? value.bullets.map(String).slice(0, 8) : [],
  strengths: Array.isArray(value?.strengths) ? value.strengths.map(String).slice(0, 8) : [],
  areasForGrowth: Array.isArray(value?.areasForGrowth) ? value.areasForGrowth.map(String).slice(0, 8) : [],
  recommendations: Array.isArray(value?.recommendations) ? value.recommendations.map(String).slice(0, 8) : [],
  risks: Array.isArray(value?.risks) ? value.risks.map(String).slice(0, 8) : [],
  sentiment: value?.sentiment && typeof value.sentiment === 'object' ? {
    positive: Number(value.sentiment.positive || 0),
    neutral: Number(value.sentiment.neutral || 0),
    negative: Number(value.sentiment.negative || 0),
  } : null,
  flags: Array.isArray(value?.flags) ? value.flags.map(String).slice(0, 8) : [],
  provider: value?.provider || provider,
});

const localInsight = (action, input) => {
  const text = String(input.comments || input.feedback || '').trim();
  if (action === 'validate_feedback') {
    const suspicious = !text || /^(asdf|test|qwerty|spam|lorem)\w*$/i.test(text) || /(idiot|stupid|hate you)/i.test(text);
    return normalizeResult({ title: suspicious ? 'Please revise this comment' : 'Comment looks constructive', summary: suspicious ? 'Use specific, respectful observations and a suggested improvement.' : 'The comment is specific enough to continue.', flags: suspicious ? ['Comment may be too short, repetitive, or offensive.'] : [], provider: 'local' });
  }
  if (action === 'summarize_feedback') return normalizeResult({ title: 'Feedback summary', summary: text ? `Reviewed ${text.split(/\s+/).length} words of qualitative feedback.` : 'No qualitative feedback was supplied.', strengths: text ? ['Review recurring positive themes in the submitted comments.'] : [], areasForGrowth: text ? ['Convert repeated concerns into one measurable teaching action.'] : [], sentiment: { positive: 34, neutral: 52, negative: 14 }, provider: 'local' });
  if (action === 'career_growth' || action === 'mentorship') return normalizeResult({ title: 'Growth recommendations', summary: 'Use the evaluation pattern to choose one focused improvement cycle.', recommendations: ['Review feedback by course and assessment type.', 'Set one measurable teaching goal for the next semester.', 'Schedule a peer observation and revisit the evidence after four weeks.'], provider: 'local' });
  if (action === 'audit_security') {
    const alerts = Array.isArray(input.alerts) ? input.alerts : [];
    const recommendations = [];
    alerts.forEach((alert) => {
      const signal = `${alert.title || ''} ${alert.detail || ''}`.toLowerCase();
      if (signal.includes('database unavailable')) recommendations.push('Verify the database service and network connection, then inspect backend logs for connection or authentication failures.');
      else if (signal.includes('database latency')) recommendations.push('Review database slow-query logs and query plans, then check connection-pool saturation before changing indexes.');
      else if (signal.includes('api error')) recommendations.push('Group recent API failures by route and status code, then inspect the corresponding backend logs and dependency health.');
      else if (signal.includes('disk usage') || signal.includes('disk capacity')) recommendations.push('Check the server volume for large logs and expired generated backups; preserve a recent verified recovery point before cleanup.');
      else if (signal.includes('memory usage')) recommendations.push('Inspect Node.js process memory and recent workload changes; profile sustained growth before restarting services.');
      else if (signal.includes('backup')) recommendations.push('Create a fresh database backup and verify the generated SQL file before relying on it as a recovery point.');
      else recommendations.push(`Investigate the server signal “${String(alert.title || 'System warning').slice(0, 120)}” and verify the relevant service logs.`);
    });
    return normalizeResult({
      title: alerts.length ? 'System health diagnostic' : 'System monitoring result',
      summary: alerts.length ? `Reviewed ${alerts.length} active system health signal${alerts.length === 1 ? '' : 's'} using the available local diagnostic rules.` : 'No active system health signals were supplied.',
      recommendations: [...new Set(recommendations)].slice(0, 8),
      risks: alerts.map((alert) => `${alert.level || 'warning'}: ${alert.title || alert.detail || 'System health issue'}`).slice(0, 8),
      provider: 'local',
    });
  }
  if (action === 'anomalies') return normalizeResult({ title: 'Monitoring result', summary: 'No external AI provider is configured; review the supplied records with the operational controls.', risks: ['Automated analysis is unavailable until an AI provider is configured.'], provider: 'local' });
  return normalizeResult({ title: 'Executive insight', summary: 'Connect an AI provider to generate evidence-based institutional trends.', recommendations: ['Configure AI_PROVIDER and its corresponding credential.', 'Review results against the source evaluation reports before publishing.'], provider: 'local' });
};

const callProvider = async (action, input) => {
  const system = 'You are an education quality analyst for Mekdela Amba University. Return JSON only. Never infer names, protected traits, or facts absent from the input. Give constructive, evidence-based recommendations.';
  const schema = '{"title":"string","summary":"string","bullets":["string"],"strengths":["string"],"areasForGrowth":["string"],"recommendations":["string"],"risks":["string"],"sentiment":{"positive":0,"neutral":0,"negative":0},"flags":["string"]}';
  const prompt = `${system}\nAction: ${action}\nOutput schema: ${schema}\nInput JSON:\n${JSON.stringify(input)}`;
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    const response = await fetch(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: `${prompt}` }] }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const data = await response.json();
    return normalizeResult({ ...json(data.choices?.[0]?.message?.content || '{}'), provider: 'openai' });
  }
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const endpoint = process.env.GEMINI_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`;
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }, contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json();
    return normalizeResult({ ...json(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'), provider: 'gemini' });
  }
  if (provider === 'local' && process.env.LOCAL_LLM_URL) {
    const response = await fetch(process.env.LOCAL_LLM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.LOCAL_LLM_TOKEN ? { Authorization: `Bearer ${process.env.LOCAL_LLM_TOKEN}` } : {}) }, body: JSON.stringify({ model: process.env.LOCAL_LLM_MODEL || 'local-model', messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } }) });
    if (!response.ok) throw new Error(`Local LLM request failed (${response.status})`);
    const data = await response.json();
    return normalizeResult({ ...json(data.choices?.[0]?.message?.content || data.response || '{}'), provider: 'local' });
  }
  return localInsight(action, input);
};

const generateInsight = async (action, input = {}) => {
  if (!ACTIONS.has(action)) throw new Error('Unsupported AI action.');
  const safeInput = JSON.parse(JSON.stringify(input || {}));
  const serialized = JSON.stringify(safeInput);
  if (serialized.length > MAX_INPUT_LENGTH) throw new Error('AI input is too large.');
  const key = crypto.createHash('sha256').update(`${provider}:${action}:${serialized}`).digest('hex');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await callProvider(action, safeInput);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return value;
};

router.post('/insights', authenticateToken, authorizeRoles(...ALLOWED_ROLES), async (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();
  try {
    const result = await generateInsight(action, { ...req.body?.input, role: req.user.role });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.message.includes('Unsupported') || error.message.includes('too large') ? 400 : 502).json({ success: false, message: error.message || 'AI service unavailable.' });
  }
});

router.get('/insights', authenticateToken, authorizeRoles(...ALLOWED_ROLES), getRoleBasedInsights);
router.get('/smart-insights', authenticateToken, authorizeRoles(...ALLOWED_ROLES), getRoleBasedInsights);
router.get('/dept-head-insights', authenticateToken, authorizeRoles('dept_head'), getDeptHeadAiInsights);

module.exports = { router, generateInsight };
