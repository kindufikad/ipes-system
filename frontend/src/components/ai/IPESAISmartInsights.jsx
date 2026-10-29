import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiApi, notificationApi } from '../../services/api';
import { useAuth } from '../../context/useAuth';
import { useEvaluation } from '../../context/useEvaluation';
import { SUBMISSIONS_UPDATED_EVENT } from '../../services/formSubmissions';
import AIInsightsWidget from './AIInsightsWidget';

const normalizeRole = (role) => String(role || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const normalizeInsightData = (result = {}) => {
  const payload = result && typeof result === 'object' && result.data && typeof result.data === 'object'
    ? result.data
    : result;
  return {
    ...payload,
    summary: Array.isArray(payload.aiObservations) ? payload.aiObservations : (payload.summary || []),
    recommendations: Array.isArray(payload.recommendedActions) ? payload.recommendedActions : (payload.recommendations || []),
    topFeedbackKeywords: Array.isArray(payload.topKeywords) ? payload.topKeywords : (payload.topFeedbackKeywords || []),
    totalSubmitted: payload.completedCount ?? payload.totalSubmitted ?? 0,
  };
};

const createSummaryCsv = (data, role) => {
  const rows = [
    ['Metric', 'Value'],
    ['Role', role],
    ['Completion rate', `${Number(data.completionRate || 0).toFixed(1)}%`],
    ['Average score', `${Number(data.averageScore || 0).toFixed(1)}%`],
    ['Total required', Number(data.totalRequired || 0)],
    ['Total submitted', Number(data.totalSubmitted || 0)],
    ['Pending evaluations', Number(data.pendingCount || 0)],
    ['Pending deadlines (7 days)', Number(data.pendingDeadlines || 0)],
    ['Top feedback keywords', (data.topFeedbackKeywords || []).join(' | ')],
    ['High activity blocks', (data.highActivityBlocks || []).map((block) => `${block.block} (${block.events})`).join(' | ')],
    ...(data.summary || []).map((observation) => ['Observation', observation]),
    ...(data.anomalies || []).map((anomaly) => ['Uniform score cluster', `${anomaly.courseName}: ${anomaly.reason}`]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
};

const IPESAISmartInsights = ({
  role,
  departmentId,
  userId,
  onActionClick,
  onDataChange,
}) => {
  const { user } = useAuth();
  const { refreshVersion } = useEvaluation();
  const normalizedRole = normalizeRole(role || user?.role);
  const [insightsData, setInsightsData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [anomaliesOpen, setAnomaliesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const params = {};
    if (departmentId) params.departmentId = departmentId;
    if (userId || user?.id) params.userId = userId || user.id;

    const loadInsights = () => {
      setIsLoading(true);
      setError('');
      const insightsRequest = normalizedRole === 'INSTRUCTOR'
        ? aiApi.getInstructorAiInsights()
        : aiApi.getSummary(normalizedRole, params);
      insightsRequest
        .then((result) => {
          if (!active) return;
          const nextData = normalizeInsightData(result && typeof result === 'object' ? result : {});
          setInsightsData(nextData);
          onDataChange?.(nextData);
        })
        .catch((error) => {
          if (!active) return;
          const message = error?.message || 'Insights are temporarily unavailable.';
          setError(message);
          setInsightsData({});
          onDataChange?.({});
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    };

    loadInsights();
    if (normalizedRole === 'STUDENT') {
      window.addEventListener(SUBMISSIONS_UPDATED_EVENT, loadInsights);
    }

    return () => {
      active = false;
      window.removeEventListener(SUBMISSIONS_UPDATED_EVENT, loadInsights);
    };
  }, [departmentId, normalizedRole, onDataChange, refreshVersion, retryCount, user?.id, userId]);

  const scrollToPending = () => {
    const pendingTarget = document.querySelector('[data-pending-evaluations], #pending-evaluations, #my-evaluations, #evaluation-tracking');
    if (pendingTarget) pendingTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const exportSummary = () => {
    const file = new Blob([createSummaryCsv(insightsData, normalizedRole)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ipes-ai-insights-${normalizedRole.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Insights summary exported.');
  };

  const handleAction = async (actionType, payload) => {
    if (actionType === 'EXPORT_SUMMARY' || actionType === 'EXPORT_REPORT') {
      exportSummary();
      return;
    }

    if (actionType === 'INSPECT_ANOMALIES' || actionType === 'INSPECT_SCORE_ANOMALIES') {
      const handled = await onActionClick?.(actionType, payload);
      if (handled !== true) setAnomaliesOpen(true);
      return;
    }

    if (actionType === 'SEND_REMINDERS') {
      if (normalizedRole !== 'DEPT_HEAD') {
        toast.error('Reminder broadcasts are available to Department Heads.');
        return;
      }
      try {
        const result = await notificationApi.sendReminders();
        toast.success(`Reminders sent to ${Number(result?.sent || 0)} evaluators; ${Number(result?.telegramSent || 0)} via Telegram.`);
        const nextData = normalizeInsightData(await aiApi.getSummary(normalizedRole, { departmentId }));
        setInsightsData(nextData);
        onDataChange?.(nextData);
      } catch (error) {
        toast.error(error?.message || 'Unable to send evaluation reminders.');
      }
      return;
    }

    if (['VIEW_PENDING', 'VIEW_DEPARTMENT_PENDING', 'VIEW_PENDING_EVALUATIONS', 'VIEW_QA_COMPLIANCE'].includes(actionType)) {
      await onActionClick?.(actionType, payload);
      window.setTimeout(scrollToPending, 0);
      return;
    }

    await onActionClick?.(actionType, payload);
  };

  return <>
    {error ? (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="ml-3 font-semibold underline underline-offset-2">Retry</button>
      </div>
    ) : (
      <AIInsightsWidget
        role={normalizedRole}
        data={insightsData}
        isLoading={isLoading}
        isEnabled
        isRefreshing={isLoading}
        onRefresh={() => setRetryCount((count) => count + 1)}
        onActionClick={handleAction}
      />
    )}
    {anomaliesOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="ipes-ai-anomalies-title">
      <section className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Evaluation anomaly review</p><h2 id="ipes-ai-anomalies-title" className="mt-1 text-xl font-bold text-slate-900">Uniform score clusters</h2></div>
          <button type="button" onClick={() => setAnomaliesOpen(false)} aria-label="Close anomaly review" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        {!insightsData.anomalies?.length ? <p className="py-8 text-sm text-slate-600">No uniform score clusters were detected in the current data.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Course</th><th className="px-3 py-2">Instructor</th><th className="px-3 py-2">Responses</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Finding</th></tr></thead><tbody className="divide-y divide-slate-100">{insightsData.anomalies.map((anomaly, index) => <tr key={`${anomaly.assignmentId || anomaly.dispatchId || index}`}><td className="px-3 py-3">{anomaly.courseName || 'Assigned course'}</td><td className="px-3 py-3">{anomaly.instructorName || 'Instructor'}</td><td className="px-3 py-3">{Number(anomaly.responseCount || 0)}</td><td className="px-3 py-3">{Number(anomaly.score || 0).toFixed(1)}%</td><td className="px-3 py-3">{anomaly.reason || 'Uniform submitted scores'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>}
  </>;
};

export default IPESAISmartInsights;
