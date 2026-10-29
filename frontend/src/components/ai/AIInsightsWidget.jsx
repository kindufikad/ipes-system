import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';

const ROLE_LABELS = {
  STUDENT: 'STUDENT LIVE ASSIST',
  LAB_ASSISTANT: 'LAB ASSISTANT MODE',
  INSTRUCTOR: 'INSTRUCTOR MODE',
  DEPT_HEAD: 'DEPT HEAD MODE',
  DEAN: 'DEAN MODE',
  ACADEMIC_DIRECTOR: 'ACADEMIC DIRECTOR MODE',
  ADMIN: 'ADMIN MONITOR',
};

const ROLE_DEFAULTS = {
  STUDENT: [{ title: 'Review pending evaluations', description: 'Complete outstanding evaluations before their deadlines.', actionLabel: 'View Pending', actionType: 'VIEW_PENDING' }],
  LAB_ASSISTANT: [{ title: 'Set an improvement goal', description: 'Choose one measurable lab practice improvement for the next cycle.', actionLabel: 'Set Improvement Goal', actionType: 'SET_GOAL' }],
  INSTRUCTOR: [{ title: 'Set a teaching goal', description: 'Choose one measurable teaching improvement for the next evaluation cycle.', actionLabel: 'Set Improvement Goal', actionType: 'SET_GOAL' }],
  DEPT_HEAD: [{ title: 'Review completion gaps', description: 'Identify pending student evaluations and send targeted reminders.', actionLabel: 'Review Completion Gaps', actionType: 'VIEW_PENDING' }, { title: 'Inspect score clustering', description: 'Review assignments where submitted scores are identical.', actionLabel: 'Inspect Anomalies', actionType: 'INSPECT_ANOMALIES' }],
  DEAN: [{ title: 'Review completion gaps', description: 'Compare department coverage and follow up on incomplete evaluations.', actionLabel: 'Review Completion Gaps', actionType: 'VIEW_PENDING' }],
  ACADEMIC_DIRECTOR: [{ title: 'Inspect score clustering', description: 'Review uniform score patterns in institutional reports.', actionLabel: 'Inspect Anomalies', actionType: 'INSPECT_ANOMALIES' }],
  ADMIN: [{ title: 'Inspect score clustering', description: 'Review unusual evaluation patterns in system reports.', actionLabel: 'Inspect Anomalies', actionType: 'INSPECT_ANOMALIES' }],
};

const normalizeRole = (role) => {
  const normalized = String(role || 'INSTRUCTOR').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'DEPARTMENT_HEAD' || normalized === 'DEPTHEAD') return 'DEPT_HEAD';
  if (normalized === 'LABASSISTANT') return 'LAB_ASSISTANT';
  if (normalized === 'ACADEMIC_DIRECTORATE' || normalized === 'DIRECTORATE') return 'ACADEMIC_DIRECTOR';
  return ROLE_LABELS[normalized] ? normalized : 'INSTRUCTOR';
};

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const getSentiment = (sentiment = {}) => {
  const positive = clampPercent(sentiment.positive);
  const neutral = clampPercent(sentiment.neutral);
  const negative = clampPercent(sentiment.negative);
  const total = positive + neutral + negative;

  if (!total) return { positive: 0, neutral: 0, negative: 0 };

  return {
    positive: Number((positive / total * 100).toFixed(1)),
    neutral: Number((neutral / total * 100).toFixed(1)),
    negative: Number((negative / total * 100).toFixed(1)),
  };
};

const getTopKeywords = (data) => {
  if (Array.isArray(data.topFeedbackKeywords)) return data.topFeedbackKeywords.filter(Boolean).map(String).slice(0, 3);
  const text = [data.feedback, data.comments, ...(Array.isArray(data.feedbackComments) ? data.feedbackComments : [])].filter(Boolean).join(' ').toLowerCase();
  const counts = new Map();
  (text.match(/[a-z\u1200-\u137f]{4,}/giu) || []).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([word]) => word);
};

const LoadingState = () => (
  <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3 lg:p-6" aria-live="polite" aria-label="Loading AI insights">
    <div className="space-y-4 lg:col-span-2">
      <div className="h-3 w-32 animate-pulse rounded bg-white/15" />
      <div className="h-4 w-full animate-pulse rounded bg-white/10" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
      <div className="h-4 w-4/6 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-full animate-pulse rounded-full bg-white/10" />
    </div>
    <div className="space-y-3 lg:col-span-1">
      <div className="h-3 w-36 animate-pulse rounded bg-white/15" />
      <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
      <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
    </div>
  </div>
);

/**
 * @typedef {Object} AIInsightsData
 * @property {string[]} summary
 * @property {{positive: number, neutral: number, negative: number}} sentiment
 * @property {Array<{title: string, description: string, actionLabel: string, actionType: string}>} recommendations
 * @property {string} [alert]
 */

/**
 * @param {Object} props
 * @param {'STUDENT'|'LAB_ASSISTANT'|'INSTRUCTOR'|'DEPT_HEAD'|'DEAN'|'ACADEMIC_DIRECTOR'|'ADMIN'} props.role
 * @param {AIInsightsData} props.data
 * @param {boolean} props.isLoading
 * @param {boolean} props.isEnabled
 * @param {(actionType: string, payload: Object) => void} props.onActionClick
 */
const AIInsightsWidget = ({
  role = 'INSTRUCTOR',
  data = {},
  isLoading = false,
  isEnabled = true,
  onActionClick = () => {},
  onRefresh = () => {},
  isRefreshing = false,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const roleKey = normalizeRole(role);
  const summary = Array.isArray(data.summary) ? data.summary.filter(Boolean).map(String) : [];
  const recommendations = Array.isArray(data.recommendations) && data.recommendations.length
    ? data.recommendations.filter((recommendation) => recommendation?.title && recommendation?.actionType)
    : ROLE_DEFAULTS[roleKey] || [];
  const sentiment = getSentiment(data.sentiment);
  const topKeywords = useMemo(() => getTopKeywords(data), [data]);
  const averageScore = clampPercent(data.averageScore ?? data.average_score ?? data.aggregateScore ?? data.aggregate_score);
  const completionRate = clampPercent(
    data.completionRate
      ?? data.completion_rate
      ?? data.overallCompletionRate
      ?? data.overall_completion_rate
      ?? data.metrics?.completionRate
      ?? data.metrics?.completion_rate
  );
  const totalRequired = Number(data.totalRequired ?? data.total_required ?? data.metrics?.totalRequired ?? data.metrics?.total_required ?? 0);
  const totalSubmitted = Number(data.totalSubmitted ?? data.total_submitted ?? data.completedCount ?? data.metrics?.totalSubmitted ?? data.metrics?.total_submitted ?? 0);
  const pendingCount = Number(data.pendingCount ?? data.pending_count ?? data.metrics?.pendingCount ?? data.metrics?.pending_count ?? 0);
  const hasMetrics = Object.hasOwn(data, 'completionRate') || Object.hasOwn(data, 'completion_rate') || Object.hasOwn(data, 'totalRequired') || Object.hasOwn(data, 'total_required') || Object.hasOwn(data, 'totalSubmitted') || Object.hasOwn(data, 'total_submitted') || Object.hasOwn(data, 'pendingCount') || Object.hasOwn(data, 'pending_count');
  const hasContent = summary.length > 0 || recommendations.length > 0 || Object.values(sentiment).some(Boolean) || averageScore > 0 || topKeywords.length > 0 || hasMetrics;
  const benchmark = data.benchmark || {};
  const completionTone = completionRate >= 80
    ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100'
    : completionRate >= 50
      ? 'border-amber-300/35 bg-amber-300/15 text-amber-100'
      : 'border-rose-300/35 bg-rose-400/15 text-rose-100';
  const benchmarkPrimary = benchmark.departmentAverage ?? benchmark.primaryAverage;
  const benchmarkComparison = benchmark.collegeAverage ?? benchmark.comparisonAverage;
  const benchmarkPrimaryLabel = benchmark.departmentAverage !== undefined ? 'Department average' : (benchmark.primaryLabel || 'College average');
  const benchmarkComparisonLabel = benchmark.collegeAverage !== undefined ? 'College benchmark' : (benchmark.comparisonLabel || 'University benchmark');

  return (
    <section
      className="overflow-hidden rounded-2xl border border-indigo-500/40 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 text-white shadow-2xl shadow-indigo-950/30 backdrop-blur-md"
      aria-labelledby="ipes-ai-insights-title"
    >
      <div className="flex items-center gap-2 border border-indigo-500/30 bg-slate-900 p-2 text-white sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-controls="ipes-ai-insights-panel"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 sm:px-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-300/30 bg-indigo-400/20 text-emerald-200">
              <Sparkles className="animate-pulse" size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span id="ipes-ai-insights-title" className="block truncate text-sm font-bold sm:text-base">IPES AI Smart Insights</span>
              <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200/70">{ROLE_LABELS[roleKey]}</span>
            </span>
            <span className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:inline-flex ${completionTone}`}>Completion Rate: {isLoading ? '--' : `${completionRate.toFixed(1)}%`}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-indigo-100">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold sm:hidden ${completionTone}`}>{isLoading ? '--' : `${completionRate.toFixed(1)}%`}</span>
            {isExpanded ? <ChevronUp size={19} aria-hidden="true" /> : <ChevronDown size={19} aria-hidden="true" />}
          </span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading || isRefreshing}
          aria-label="Refresh AI Insights"
          title="Refresh AI Insights"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-400/10 px-2.5 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-300/20 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-60 sm:px-3"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="hidden sm:inline">Refresh AI Insights</span>
          <span className="sm:hidden">Refresh</span>
        </button>
      </div>

      <div
        id="ipes-ai-insights-panel"
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        aria-hidden={!isExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          {!isEnabled ? (
        <div className="flex items-center gap-3 p-8 text-sm text-indigo-100/75" role="status">
          <XCircle className="shrink-0 text-indigo-300" size={20} aria-hidden="true" />
          <p>AI insights are currently unavailable for this dashboard.</p>
        </div>
      ) : isLoading ? (
        <LoadingState />
      ) : !hasContent ? (
        <div className="flex items-center gap-3 p-8 text-sm text-indigo-100/75" role="status">
          <Lightbulb className="shrink-0 text-emerald-300" size={20} aria-hidden="true" />
          <p>Insights will appear here when evaluation data is available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3 lg:p-6">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Average Evaluation Score</p><p className="mt-2 text-2xl font-bold text-white">{isLoading ? '--' : data.averageScore === undefined && data.average_score === undefined ? 'Awaiting data' : `${averageScore.toFixed(1)}%`}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Completion Rate</p><p className="mt-2 text-2xl font-bold text-white">{isLoading ? '--' : `${completionRate.toFixed(1)}%`}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Evaluation completion rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionRate}><span className={`block h-full rounded-full transition-all duration-700 ${completionRate >= 80 ? 'bg-emerald-400' : completionRate >= 50 ? 'bg-amber-300' : 'bg-rose-400'}`} style={{ width: `${completionRate}%` }} /></div><p className="mt-2 text-xs text-indigo-100/70">{totalSubmitted} of {totalRequired} required · {pendingCount} pending</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Top Feedback Keywords</p>{topKeywords.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{topKeywords.map((keyword) => <span key={keyword} className="rounded-full bg-indigo-400/20 px-2.5 py-1 text-xs text-indigo-100">{keyword}</span>)}</div> : <p className="mt-2 text-sm text-indigo-100/70">{data.feedbackTip || 'Awaiting more written feedback'}</p>}</div>
            </div>
            {summary.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">AI observations</p>
                <ul className="space-y-3">
                  {summary.map((observation, index) => (
                    <li key={`${observation}-${index}`} className="flex gap-3 text-sm leading-6 text-indigo-50/90">
                      <Check className="mt-1 shrink-0 text-emerald-300" size={16} aria-hidden="true" />
                      <span>{observation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {benchmark && (benchmarkPrimary !== undefined || benchmarkComparison !== undefined) && (
              <div className="rounded-xl border border-indigo-300/20 bg-indigo-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Performance benchmark</p>
                <p className="mt-2 text-sm text-indigo-50/90">
                  {benchmarkPrimaryLabel}: <span className="font-semibold">{Number(benchmarkPrimary ?? averageScore).toFixed(1)}%</span>
                  {' '} · {benchmarkComparisonLabel}: <span className="font-semibold">{Number(benchmarkComparison ?? 0).toFixed(1)}%</span>
                </p>
                <p className="mt-2 text-xs text-indigo-100/70">{benchmark.comparisonResult || benchmark.comparisonLabel || 'Benchmark comparison available.'}</p>
              </div>
            )}
            {Object.values(sentiment).some(Boolean) && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Sentiment</p>
                  <span className="text-xs text-indigo-100/60">Evaluation feedback</span>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-white/10" aria-label={`Positive ${sentiment.positive} percent, neutral ${sentiment.neutral} percent, negative ${sentiment.negative} percent`}>
                  <span className="bg-emerald-400 transition-all duration-700" style={{ width: `${sentiment.positive}%` }} />
                  <span className="bg-amber-300 transition-all duration-700" style={{ width: `${sentiment.neutral}%` }} />
                  <span className="bg-rose-400 transition-all duration-700" style={{ width: `${sentiment.negative}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  <span className="text-emerald-200">Positive {sentiment.positive}%</span>
                  <span className="text-amber-100">Neutral {sentiment.neutral}%</span>
                  <span className="text-rose-200">Negative {sentiment.negative}%</span>
                </div>
              </div>
            )}
          </div>

          {recommendations.length > 0 && (
            <div className="lg:col-span-1">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-200/70">Recommended actions</p>
              <div className="space-y-3">
                {recommendations.map((recommendation, index) => (
                  <article key={`${recommendation.actionType}-${recommendation.title}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.07] p-4 transition hover:border-indigo-300/40 hover:bg-white/[0.11]">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-400/20 text-indigo-200">
                        <Lightbulb size={17} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white">{recommendation.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-indigo-100/70">{recommendation.description}</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (recommendation.actionType === 'VIEW_FEEDBACK') document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            onActionClick(recommendation.actionType, recommendation);
                          }}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-400/15 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-300/25 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          {recommendation.actionLabel || 'Review'}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </section>
  );
};

export default AIInsightsWidget;
