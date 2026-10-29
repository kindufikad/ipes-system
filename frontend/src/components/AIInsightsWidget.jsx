import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FlaskConical,
  Lightbulb,
  LineChart,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';

const ROLE_CONFIG = {
  student: {
    label: 'Student',
    icon: ClipboardCheck,
    summary: 'Improve the quality and usefulness of your evaluation feedback.',
    observations: [
      'Specific comments help instructors act on feedback more effectively.',
      'Constructive wording is most useful when it describes an observable classroom experience.',
      'Complete pending peer surveys before their deadline to keep evaluation results current.',
    ],
    recommendations: [
      { id: 'feedback-tip', title: 'Strengthen feedback wording', description: 'Turn general comments into clear, evidence-based suggestions.', actionLabel: 'Apply Tip', icon: Lightbulb },
      { id: 'peer-deadline', title: 'Review pending surveys', description: 'Check deadlines and finish any peer evaluations assigned to you.', actionLabel: 'View Surveys', icon: Clock3 },
    ],
  },
  lab_assistant: {
    label: 'Lab Assistant',
    icon: FlaskConical,
    summary: 'Track practical-session quality, safety feedback, and student engagement.',
    observations: [
      'Student engagement is strongest when practical instructions are paired with visible demonstrations.',
      'Equipment and safety comments should be reviewed alongside session-level trends.',
      'Repeated setup concerns may indicate a maintenance or preparation workflow opportunity.',
    ],
    recommendations: [
      { id: 'lab-trends', title: 'Review lab trends', description: 'Compare practical-session scores and identify recurring patterns.', actionLabel: 'View Lab Logs', icon: LineChart },
      { id: 'safety-feedback', title: 'Inspect safety feedback', description: 'Review equipment, preparation, and safety-related observations.', actionLabel: 'Inspect Feedback', icon: Wrench },
    ],
  },
  instructor: {
    label: 'Instructor',
    icon: BarChart3,
    summary: 'Use teaching evaluation evidence to reinforce strengths and target improvements.',
    observations: [
      'Student sentiment can reveal where a strong teaching practice is having the greatest impact.',
      'Compare strengths with areas for growth before choosing a pedagogical intervention.',
      'Small, measurable changes are easier to evaluate in the next feedback cycle.',
    ],
    recommendations: [
      { id: 'teaching-strengths', title: 'Review teaching strengths', description: 'Explore the practices most consistently recognized by students and peers.', actionLabel: 'View Strengths', icon: CheckCircle2 },
      { id: 'pedagogy-tip', title: 'Get a teaching recommendation', description: 'Generate a practical improvement suggestion from your evaluation trends.', actionLabel: 'Apply Tip', icon: Lightbulb },
    ],
  },
  dept_head: {
    label: 'Dept Head',
    icon: Users,
    summary: 'Monitor department-wide quality, completion, and unusual evaluation patterns.',
    observations: [
      'Completion rates help distinguish a genuine performance signal from incomplete coverage.',
      'Uniform scores across many submissions can warrant a closer review of response quality.',
      'Prioritize interventions that address recurring issues across multiple instructors.',
    ],
    recommendations: [
      { id: 'department-rankings', title: 'Review instructor rankings', description: 'Compare department performance while accounting for evaluation completion.', actionLabel: 'View Rankings', icon: BarChart3 },
      { id: 'outliers', title: 'Inspect unusual patterns', description: 'Investigate score clustering, missing submissions, and other anomalies.', actionLabel: 'Inspect Outliers', icon: Search },
    ],
  },
  dean: {
    label: 'Dean',
    icon: BarChart3,
    summary: 'Compare college quality metrics and turn department trends into strategy.',
    observations: [
      'Department comparisons are most useful when evaluation coverage is considered alongside scores.',
      'Persistent gaps between departments may indicate a targeted support opportunity.',
      'Strategic recommendations should connect quality metrics to academic priorities.',
    ],
    recommendations: [
      { id: 'department-comparison', title: 'Compare departments', description: 'Review college-wide performance differences and completion rates.', actionLabel: 'Compare Departments', icon: BarChart3 },
      { id: 'academic-strategy', title: 'Build an academic strategy', description: 'Generate recommendations for quality improvement across the college.', actionLabel: 'Generate Strategy', icon: Lightbulb },
    ],
  },
  academic_director: {
    label: 'Academic Director',
    icon: ShieldAlert,
    summary: 'Track institutional quality assurance, Senate reporting, and policy compliance.',
    observations: [
      'University-level trends provide an early signal for quality assurance planning.',
      'Senate summaries should clearly separate completed evidence from pending evaluations.',
      'Policy compliance alerts are most actionable when assigned to an accountable owner.',
    ],
    recommendations: [
      { id: 'senate-report', title: 'Prepare Senate summary', description: 'Compile a concise report of institutional evaluation trends.', actionLabel: 'Generate Senate Report', icon: FileText },
      { id: 'compliance', title: 'Review compliance alerts', description: 'Inspect policy exceptions, overdue cycles, and unresolved quality flags.', actionLabel: 'View Compliance', icon: ShieldAlert },
    ],
  },
  admin: {
    label: 'Admin',
    icon: Wrench,
    summary: 'Observe system activity, AI service health, evaluation status, and audit signals.',
    observations: [
      'AI latency and token usage should be monitored alongside feature adoption.',
      'Unsubmitted evaluations can affect the reliability of published performance results.',
      'Audit activity helps identify operational issues that require follow-up.',
    ],
    recommendations: [
      { id: 'ai-health', title: 'Inspect AI service health', description: 'Review token usage, response latency, and recent service errors.', actionLabel: 'View AI Metrics', icon: LineChart },
      { id: 'audit-log', title: 'Review audit activity', description: 'Inspect recent system events and unresolved evaluation status.', actionLabel: 'View Audit Logs', icon: FileText },
    ],
  },
};

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (value === 'department_head' || value === 'depthead') return 'dept_head';
  if (value === 'labassistant') return 'lab_assistant';
  if (value === 'academic_directorate' || value === 'directorate') return 'academic_director';
  if (value === 'college_dean') return 'dean';
  return ROLE_CONFIG[value] ? value : 'instructor';
};

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const getSentiment = (data = {}) => {
  const source = data.sentiment || data.sentiment_percentages || {};
  const positive = clampPercent(source.positive ?? data.positive);
  const neutral = clampPercent(source.neutral ?? data.neutral);
  const negative = clampPercent(source.negative ?? data.negative);
  const total = positive + neutral + negative;
  if (!total) return { positive: 0, neutral: 0, negative: 0 };
  return {
    positive: Number((positive / total * 100).toFixed(1)),
    neutral: Number((neutral / total * 100).toFixed(1)),
    negative: Number((negative / total * 100).toFixed(1)),
  };
};

const toList = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);

/**
 * @typedef {Object} AIInsightData
 * @property {string[]} [observations]
 * @property {string[]} [summary]
 * @property {{positive?: number, neutral?: number, negative?: number}} [sentiment]
 * @property {Array<Object>} [recommendations]
 * @property {string} [alert]
 * @property {number} [alertCount]
 * @property {boolean} [hasCriticalAlert]
 */

/**
 * @param {{role?: string, data?: AIInsightData, isLoading?: boolean, isEnabled?: boolean, onActionClick?: (action: Object) => void}} props
 */
const AIInsightsWidget = ({ role = 'instructor', data = {}, isLoading = false, isEnabled = true, onActionClick = () => {} }) => {
  const roleKey = normalizeRole(role);
  const config = ROLE_CONFIG[roleKey];
  const sentiment = getSentiment(data);
  const observations = toList(data.observations || data.insights || data.summary);
  const visibleObservations = observations.length ? observations : config.observations;
  const recommendations = Array.isArray(data.recommendations) && data.recommendations.length ? data.recommendations : config.recommendations;
  const hasAlert = Boolean(data.hasCriticalAlert || data.alert || data.alertCount);
  const alertText = data.alert || (data.alertCount ? `${data.alertCount} evaluation pattern${data.alertCount === 1 ? '' : 's'} flagged for review.` : 'Critical evaluation findings require review.');
  const handleAction = (recommendation) => onActionClick({ ...recommendation, role: roleKey });

  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 text-white shadow-2xl shadow-indigo-950/20 backdrop-blur" aria-labelledby="ipes-ai-insights-title">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-400/10 blur-3xl" />
      <header className="relative flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-300/30 bg-indigo-400/20 text-indigo-100 shadow-lg shadow-indigo-950/30"><Sparkles className="animate-pulse" size={22} aria-hidden="true" /><span className="absolute inset-0 animate-ping rounded-2xl border border-indigo-300/20" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="ipes-ai-insights-title" className="text-lg font-bold tracking-tight">IPES AI Smart Insights</h2><span className="rounded-full border border-indigo-300/30 bg-indigo-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100">{config.label} Mode</span></div><p className="mt-1 text-sm leading-5 text-indigo-100/75">{data.description || config.summary}</p></div>
        </div>
        {hasAlert && <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-rose-300/40 bg-rose-400/15 px-3 py-1.5 text-xs font-semibold text-rose-100" role="status"><AlertTriangle size={14} aria-hidden="true" />{alertText}</div>}
      </header>

      {!isEnabled ? <div className="flex items-center gap-3 p-8 text-sm text-indigo-100/75"><X className="shrink-0 text-indigo-300" size={20} /><p>AI insights are currently unavailable for this dashboard.</p></div> : isLoading ? <LoadingState /> : <div className="relative grid gap-6 p-5 lg:grid-cols-2 lg:p-6">
        <div className="space-y-5">
          <div><p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Key observations</p><ul className="space-y-3">{visibleObservations.map((observation, index) => <li key={`${observation}-${index}`} className="flex gap-3 text-sm leading-6 text-indigo-50/90"><CheckCircle2 className="mt-1 shrink-0 text-emerald-300" size={16} aria-hidden="true" /><span>{observation}</span></li>)}</ul></div>
          <div><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Sentiment overview</p><span className="text-xs text-indigo-100/60">Evaluation feedback</span></div><div className="flex h-3 overflow-hidden rounded-full bg-white/10" aria-label={`Positive ${sentiment.positive} percent, neutral ${sentiment.neutral} percent, negative ${sentiment.negative} percent`}><span className="bg-emerald-400 transition-all duration-700" style={{ width: `${sentiment.positive}%` }} /><span className="bg-amber-300 transition-all duration-700" style={{ width: `${sentiment.neutral}%` }} /><span className="bg-rose-400 transition-all duration-700" style={{ width: `${sentiment.negative}%` }} /></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"><span className="text-emerald-200">Positive {sentiment.positive}%</span><span className="text-amber-100">Neutral {sentiment.neutral}%</span><span className="text-rose-200">Negative {sentiment.negative}%</span></div></div>
        </div>
        <div><p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Recommended actions</p><div className="space-y-3">{recommendations.map((recommendation, index) => { const ActionIcon = recommendation.icon || config.recommendations[index % config.recommendations.length].icon || Lightbulb; return <article key={recommendation.id || `${recommendation.title}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 transition hover:border-indigo-300/40 hover:bg-white/[0.11]"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-400/20 text-indigo-200"><ActionIcon size={17} aria-hidden="true" /></span><div className="min-w-0 flex-1"><h3 className="font-semibold text-white">{recommendation.title}</h3><p className="mt-1 text-sm leading-5 text-indigo-100/70">{recommendation.description}</p><button type="button" onClick={() => handleAction(recommendation)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-400/15 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-300/25 focus:outline-none focus:ring-2 focus:ring-indigo-200">{recommendation.actionLabel || 'Review' }<Search size={13} aria-hidden="true" /></button></div></div></article>; })}</div></div>
      </div>}
    </section>
  );
};

const LoadingState = () => <div className="grid gap-6 p-5 lg:grid-cols-2 lg:p-6" aria-live="polite" aria-label="Loading AI insights"><div className="space-y-4"><div className="h-3 w-32 animate-pulse rounded bg-white/15" /><div className="h-4 w-full animate-pulse rounded bg-white/10" /><div className="h-4 w-5/6 animate-pulse rounded bg-white/10" /><div className="h-4 w-4/6 animate-pulse rounded bg-white/10" /><div className="h-3 w-full animate-pulse rounded-full bg-white/10" /></div><div className="space-y-3"><div className="h-3 w-36 animate-pulse rounded bg-white/15" /><div className="h-28 animate-pulse rounded-2xl bg-white/10" /><div className="h-28 animate-pulse rounded-2xl bg-white/10" /></div></div>;

export default AIInsightsWidget;
