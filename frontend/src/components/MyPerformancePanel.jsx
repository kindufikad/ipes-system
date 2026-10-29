import { useEffect, useState } from 'react';
import { directorateApi } from '../services/api';

const formatPercent = (value) => value == null ? 'N/A' : `${Number(value).toFixed(2)}%`;

const componentMeta = [
  { key: 'peer', label: 'Peer Evaluation', color: 'emerald' },
  { key: 'vicePresident', label: 'Vice President Evaluation', color: 'blue' },
  { key: 'student', label: 'Student / Institutional Evaluation', color: 'amber' },
];

const collectFeedbackItems = (details, fields) => {
  const rows = Object.values(details || {}).flatMap((categoryRows) => (
    Array.isArray(categoryRows) ? categoryRows : []
  ));
  const comments = rows.flatMap((row) => fields.flatMap((field) => {
    const value = row?.[field];
    const values = Array.isArray(value) ? value : [value];
    return values
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }));
  return [...new Set(comments)];
};

export const calculateDirectorateTotalScore = (components = {}) => {
  const peerRaw = components.peer?.rawScore;
  const vicePresidentRaw = components.vicePresident?.rawScore;
  if (peerRaw == null || vicePresidentRaw == null) return null;

  const asPercentage = (value) => Math.min(Math.max(Number(value) || 0, 0), 100);
  const peerContribution = asPercentage(peerRaw) * 0.2;
  const vicePresidentContribution = asPercentage(vicePresidentRaw) * 0.3;
  const weightedSubtotal = peerContribution + vicePresidentContribution;

  if (components.student?.isNA) {
    return Number(((weightedSubtotal / 50) * 100).toFixed(2));
  }

  const studentRaw = components.student?.rawScore;
  if (studentRaw == null) return null;
  return Number((weightedSubtotal + asPercentage(studentRaw) * 0.5).toFixed(2));
};

const MyPerformancePanel = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadPerformance = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await directorateApi.getMyPerformance();
        if (mounted) setReport(data || {});
      } catch (loadError) {
        if (mounted) {
          setReport({});
          setError(loadError?.message || 'Unable to load your performance.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadPerformance();
    return () => { mounted = false; };
  }, []);

  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading your performance...</section>;
  if (error) return <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</section>;

  const components = report?.components || {};
  const details = report?.details || {};
  const strengths = collectFeedbackItems(details, ['strengths']);
  const improvements = collectFeedbackItems(details, ['suggestions', 'weaknesses', 'improvements']);
  const isComplete = report?.isComplete === true;
  const studentNotApplicable = components.student?.isNA === true;
  const totalScore = report?.totalScore ?? calculateDirectorateTotalScore(components);

  return (
    <section className="space-y-6" aria-labelledby="director-performance-title">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Academic Directorate</p>
        <h2 id="director-performance-title" className="mt-2 text-2xl font-bold text-slate-900">My Performance</h2>
        <p className="mt-1 text-sm text-slate-500">Your weighted evaluation summary and supporting feedback.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Weighted Score</p>
            <p className={`mt-1 text-4xl font-bold ${isComplete ? 'text-blue-700' : 'text-slate-500'}`}>{isComplete ? formatPercent(totalScore) : 'Pending'}</p>
            <p className="mt-1 text-xs text-slate-500">{report?.status || 'Pending Complete Evaluation'}</p>
          </div>
          <div className="h-3 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(Math.max(Number(totalScore) || 0, 0), 100)}%` }} />
          </div>
        </div>
      </section>

      {studentNotApplicable && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">Re-scaled to 100% (Non-Teaching Role)</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {componentMeta.map(({ key, label, color }) => {
          const sourceComponent = components[key] || {};
          const component = {
            rawScore: sourceComponent.rawScore,
            weightedScore: sourceComponent.weightedScore,
            maxWeight: sourceComponent.maxWeight,
            isNA: sourceComponent.isNA,
          };
          const maxWeight = component.maxWeight || (key === 'peer' ? 20 : key === 'vicePresident' ? 30 : 50);
          const tone = color === 'emerald' ? 'text-emerald-700' : color === 'amber' ? 'text-amber-700' : 'text-blue-700';
          return (
            <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-slate-900">{label}</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">/{maxWeight}%</span>
              </div>
              <p className={`mt-5 text-3xl font-bold ${tone}`}>{component.isNA ? 'N/A' : formatPercent(component.rawScore)}</p>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-sm text-slate-500">Weighted contribution</p>
                <p className="text-xl font-bold text-slate-900">{formatPercent(component.weightedScore)}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-emerald-950">
          <h3 className="mb-4 text-lg font-bold text-emerald-800">Strengths &amp; Positive Highlights</h3>
          {strengths.length
            ? <ul className="list-disc space-y-2 pl-5 text-sm">{strengths.map((item, index) => <li key={`${index}-${item}`} className="whitespace-pre-wrap">{item}</li>)}</ul>
            : <p className="text-sm text-emerald-900/70">No strengths have been recorded yet.</p>}
        </section>
        <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6 text-amber-950">
          <h3 className="mb-4 text-lg font-bold text-amber-800">Areas for Improvement</h3>
          {improvements.length
            ? <ul className="list-disc space-y-2 pl-5 text-sm">{improvements.map((item, index) => <li key={`${index}-${item}`} className="whitespace-pre-wrap">{item}</li>)}</ul>
            : <p className="text-sm text-amber-900/70">No improvement areas have been recorded yet.</p>}
        </section>
      </div>
    </section>
  );
};

export default MyPerformancePanel;
