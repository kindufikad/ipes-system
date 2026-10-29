import { useEffect, useState } from 'react';
import { evaluationApi } from '../services/api';
import { validateEvaluationFeedback } from '../utils/validationUtility';
import { useTranslation } from '../context/useTranslation';

const formatScore = (value, precision = 1) => `${Number(value || 0).toFixed(precision)}%`;

const getStatus = (score, t) => {
  if (score >= 90) return { label: t('performanceDashboard.excellent'), className: 'bg-emerald-100 text-emerald-700' };
  if (score >= 85) return { label: t('performanceDashboard.veryGood'), className: 'bg-blue-100 text-blue-700' };
  if (score >= 70) return { label: t('performanceDashboard.good'), className: 'bg-cyan-100 text-cyan-700' };
  if (score >= 50) return { label: t('performanceDashboard.satisfactory'), className: 'bg-amber-100 text-amber-700' };
  return { label: t('performanceDashboard.unsatisfactory'), className: 'bg-red-100 text-red-700' };
};

const CommentList = ({ items = [], emptyText }) => (
  items.filter((item) => validateEvaluationFeedback(item).valid).length ? (
    <ul className="space-y-3 text-sm text-gray-700">
      {items.filter((item) => validateEvaluationFeedback(item).valid).map((item, index) => <li key={`${item}-${index}`} className="flex gap-3"><span className="mt-1 text-current">•</span><span>{item}</span></li>)}
    </ul>
  ) : <p className="text-sm text-gray-500">{emptyText}</p>
);

const PerformanceDashboard = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await evaluationApi.getPerformanceDashboard();
        if (mounted) setReport(data);
      } catch (loadError) {
        if (mounted) setError(loadError?.message || 'Unable to load performance dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadReport();
    return () => { mounted = false; };
  }, []);

  if (loading) return <section className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{t('performanceDashboard.loading')}</section>;
  if (error) return <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</section>;
  if (report?.published === false) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center shadow-sm"><h2 className="text-xl font-bold text-amber-900">{t('performanceDashboard.pendingPublishTitle')}</h2><p className="mt-2 text-sm text-amber-800">{t('performanceDashboard.pendingPublishText')}</p></section>;

  const isComplete = report?.isComplete === true;
  const totalWeightedScore = Number(report?.totalScore ?? report?.totalWeightedScore ?? 0);
  const studentSubmissionCount = Number(report?.submission_count ?? report?.submissionCount ?? report?.breakdown?.student?.submissionCount ?? report?.breakdown?.student?.count ?? 0);
  const requiredStudentCount = Number(report?.completion?.requiredStudentCount ?? report?.student_required ?? report?.required_student_evaluators ?? 0);
  const hasAssignedCourse = (report?.hasAssignedCourses ?? (report?.hasAssignedCourse !== false))
    || studentSubmissionCount > 0
    || Number(report?.total_assignments ?? report?.totalAssignments ?? 0) > 0;
  const studentExcluded = !hasAssignedCourse;
  const studentSatisfied = studentExcluded
    || report?.completion?.isStudentComplete === true
    || (requiredStudentCount > 0 && studentSubmissionCount >= Math.ceil(requiredStudentCount / 2));
  const status = getStatus(totalWeightedScore, t);
  const backendStatus = String(report?.status || '').toLowerCase();
  const translatedBackendStatus = ({ excellent: t('performanceDashboard.excellent'), 'very good': t('performanceDashboard.veryGood'), good: t('performanceDashboard.good'), satisfactory: t('performanceDashboard.satisfactory'), unsatisfactory: t('performanceDashboard.unsatisfactory'), pending: t('performanceDashboard.pending') })[backendStatus];
  const statusLabel = isComplete ? (translatedBackendStatus || status.label) : t('performanceDashboard.pendingComplete');
  const badgeColor = isComplete ? (report?.badgeColor || (totalWeightedScore >= 90 ? 'emerald' : totalWeightedScore >= 85 ? 'blue' : totalWeightedScore >= 70 ? 'cyan' : totalWeightedScore >= 50 ? 'amber' : 'red')) : 'amber';
  const badgeClassName = {
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  }[badgeColor] || 'bg-gray-100 text-gray-700';
  const feedback = report?.feedback || {};
  const strengths = Array.isArray(feedback.strengths) ? feedback.strengths : [];
  const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : [];
  const breakdown = report?.breakdown || {};
          const studentEvaluated = studentSatisfied;
  const breakdownItems = [
    { key: 'student', label: t('performanceDashboard.student'), color: 'blue', available: !studentExcluded },
    { key: 'deptHead', label: t('performanceDashboard.deptHead'), color: 'indigo', available: true },
    { key: 'peer', label: t('performanceDashboard.peer'), color: 'emerald', available: true },
  ];
  const getWeightText = (itemKey, score) => {
    if (itemKey === 'student' && studentExcluded) return `0% ${t('instructorDashboard.weight')}`;
    if (itemKey === 'deptHead') return `${score?.weight ?? (studentExcluded ? 60 : 30)}% ${t('instructorDashboard.weight')}`;
    if (itemKey === 'peer') return `${score?.weight ?? (studentExcluded ? 40 : 20)}% ${t('instructorDashboard.weight')}`;
    return `${score?.weight ?? 50}% ${t('instructorDashboard.weight')}`;
  };
  return (
    <section id="performance-dashboard" className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between print:shadow-none">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('performanceDashboard.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('performanceDashboard.subtitle')}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm print:shadow-none">
        <div className="flex flex-col gap-5 border-b border-gray-100 pb-6 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm font-medium text-gray-500">{t('performanceDashboard.scoreTitle')}</p><p className={`mt-1 text-4xl font-bold ${isComplete ? 'text-ieps-blue-700' : 'text-slate-500'}`}>{isComplete ? formatScore(totalWeightedScore) : t('performanceDashboard.pending')}</p><p className="mt-1 text-xs text-gray-500">{studentExcluded ? t('performanceDashboard.deptHeadPeerOnly') : t('performanceDashboard.totalWeight')}</p></div>
          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-semibold ${badgeClassName}`}>{isComplete ? `${formatScore(totalWeightedScore)} - ${statusLabel}` : statusLabel}</span>
        </div>
        {!isComplete && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('performanceDashboard.allCategoriesPending')}</div>}
        {studentExcluded && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {t('performanceDashboard.studentExcluded')}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {breakdownItems.map((item) => {
          const score = breakdown[item.key] || {};
          const rawPercent = Number(score.rawPercentage ?? score.rawScore ?? (item.key === 'student' ? report?.raw_student_score : 0) ?? 0);
          const weightedPercent = Number(score.weightedContribution ?? (rawPercent * Number(score.weight ?? (hasAssignedCourse ? 50 : 0)) / 100));
          const studentStatus = !hasAssignedCourse ? 'Not assigned' : studentEvaluated ? 'Satisfied' : studentSubmissionCount > 0 ? 'In progress' : 'Active';
          const displayedValue = item.key === 'student' && studentExcluded
            ? t('performanceDashboard.notAvailable')
            : formatScore(rawPercent, item.key === 'student' ? 2 : 1);
          const weightText = getWeightText(item.key, score);
          const noteText = item.key === 'student' && studentExcluded
            ? t('performanceDashboard.noCourseAssigned')
            : t('performanceDashboard.rawPercentage');
          const contributionText = item.key === 'student' && studentExcluded
            ? '0.00%'
            : formatScore(weightedPercent, item.key === 'student' ? 2 : 1);
          return <section key={item.key} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900">{item.label}</h3><div className="flex flex-wrap justify-end gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{weightText}</span>{item.key === 'student' && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasAssignedCourse && studentEvaluated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{studentStatus}</span>}</div></div><p className="mt-4 text-3xl font-bold text-ieps-blue-700">{displayedValue}</p><p className="mt-1 text-sm text-gray-500">{noteText}</p><div className="mt-4 border-t border-gray-100 pt-3"><p className="text-sm text-gray-500">{t('performanceDashboard.weightedContribution')}</p><p className="text-xl font-bold text-gray-900">{contributionText}</p></div></section>;
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="student-feedback-section" className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-emerald-800">{t('performanceDashboard.strengthsTitle')}</h3><span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{t('performanceDashboard.strengths')}</span></div>
          <CommentList items={strengths} emptyText={t('performanceDashboard.noFeedback')} />
        </section>
        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-amber-800">{t('performanceDashboard.improvementsTitle')}</h3><span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{t('performanceDashboard.focusAreas')}</span></div>
          <CommentList items={improvements} emptyText={t('performanceDashboard.noFeedback')} />
        </section>
      </div>

    </section>
  );
};

export default PerformanceDashboard;