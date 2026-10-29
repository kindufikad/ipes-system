import { useEffect, useState } from 'react';
import { evaluationApi } from '../services/api';
import { useTranslation } from '../context/useTranslation';

const formatScore = (value, precision = 1) => `${Number(value || 0).toFixed(precision)}%`;

const DeptHeadPerformanceDashboard = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadPerformance = async () => {
      try {
        const data = await evaluationApi.getDeptHeadPerformance();
        if (mounted) setReport(data || {});
      } catch (loadError) {
        if (mounted) setError(loadError?.message || 'Unable to load performance dashboard.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadPerformance();
    return () => { mounted = false; };
  }, []);

  if (loading) return <section className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading performance dashboard...</section>;
  if (error) return <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</section>;

  const strengths = report?.strengths || report?.feedback?.strengths || [];
  const weaknesses = report?.weaknesses || report?.feedback?.improvements || [];
  const breakdown = report?.breakdown || {};
  const isComplete = report?.isComplete === true;
  const studentSubmissionCount = Number(report?.submission_count ?? report?.submissionCount ?? breakdown.student?.submissionCount ?? breakdown.student?.count ?? 0);
  const requiredStudentCount = Number(report?.completion?.requiredStudentCount ?? report?.student_required ?? report?.required_student_evaluators ?? 0);
  const breakdownItems = [
    { key: 'student', label: 'Student Evaluation' },
    { key: 'deptHead', label: t('performanceDashboard.deanEvaluation') },
    { key: 'peer', label: 'Peer Evaluation' },
  ];
  const hasAssignedCourse = (report?.hasAssignedCourses ?? (report?.hasAssignedCourse !== false))
    || studentSubmissionCount > 0
    || Number(report?.total_assignments ?? report?.totalAssignments ?? 0) > 0;
  const studentSatisfied = !hasAssignedCourse
    || report?.completion?.isStudentComplete === true
    || (requiredStudentCount > 0 && studentSubmissionCount >= Math.ceil(requiredStudentCount / 2));

  return (
    <section className="space-y-6" aria-labelledby="dept-head-performance-title">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-6">
          <div><p className="text-sm font-medium text-gray-500">Total Weighted Evaluation Score</p><p id="dept-head-performance-title" className={`mt-1 text-4xl font-bold ${isComplete ? 'text-ieps-blue-700' : 'text-slate-500'}`}>{isComplete ? formatScore(report?.totalWeightedScore) : 'Pending'}</p><p className="mt-1 text-xs text-gray-500">100% total weight</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isComplete ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{isComplete ? (report?.status || 'Completed') : 'Pending Complete Evaluation'}</span>
        </div>
        {!isComplete && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{hasAssignedCourse ? 'At least half of registered students, one peer, and the Department Head must submit evaluations.' : 'One peer and the Department Head must submit evaluations.'}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {breakdownItems.map((item) => {
          const score = breakdown[item.key] || {};
          const defaultWeight = item.key === 'student'
            ? (hasAssignedCourse ? 50 : 0)
            : item.key === 'deptHead'
              ? (hasAssignedCourse ? 30 : 60)
              : (hasAssignedCourse ? 20 : 40);
          const weight = Number(score.weight ?? defaultWeight);
          const rawPercentage = Number(score.rawPercentage ?? score.rawScore ?? (item.key === 'student' ? report?.raw_student_score : 0) ?? 0);
          const weightedContribution = Number(score.weightedContribution ?? (rawPercentage * weight / 100));
          const rawValue = item.key === 'student' && !hasAssignedCourse ? 'N/A' : formatScore(rawPercentage, item.key === 'student' ? 2 : 1);
          const contributionValue = item.key === 'student' && !hasAssignedCourse ? '0.00%' : formatScore(weightedContribution, item.key === 'student' ? 2 : 1);
          const studentStatus = !hasAssignedCourse ? 'Not assigned' : studentSatisfied ? 'Satisfied' : studentSubmissionCount > 0 ? 'In progress' : 'Active';
          return <section key={item.key} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900">{item.label}</h3><div className="flex flex-wrap justify-end gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{weight}% weight</span>{item.key === 'student' && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasAssignedCourse && studentSatisfied ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{studentStatus}</span>}</div></div><p className="mt-4 text-3xl font-bold text-ieps-blue-700">{rawValue}</p><p className="mt-1 text-sm text-gray-500">{item.key === 'student' && !hasAssignedCourse ? 'N/A - No Course Assigned' : 'Raw percentage'}</p><div className="mt-4 border-t border-gray-100 pt-3"><p className="text-sm text-gray-500">Weighted contribution</p><p className="text-xl font-bold text-gray-900">{contributionValue}</p></div></section>;
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6"><h3 className="mb-4 text-lg font-bold text-emerald-800">Strengths &amp; Positive Highlights</h3><ul className="space-y-3 text-sm text-emerald-950">{strengths.length ? strengths.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>) : <li>No strengths have been recorded yet.</li>}</ul></section>
        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6"><h3 className="mb-4 text-lg font-bold text-amber-800">Areas for Improvement</h3><ul className="space-y-3 text-sm text-amber-950">{weaknesses.length ? weaknesses.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>) : <li>No improvement areas have been recorded yet.</li>}</ul></section>
      </div>
    </section>
  );
};

export default DeptHeadPerformanceDashboard;
