import { useEffect, useState } from 'react';
import { deanApi } from '../services/api';
import { calculateDeanPerformanceScore } from '../utils/deanPerformanceScore';

const formatScore = (value) => `${Number(value || 0).toFixed(2)}%`;

// Helper to get badge styling based on status
const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Excellent':
      return 'bg-green-100 text-green-700'; // Green badge for >= 90%
    case 'Satisfactory':
      return 'bg-blue-100 text-blue-700'; // Blue badge for 75-89.9%
    default: // 'At Risk', 'Needs Improvement'
      return 'bg-amber-100 text-amber-700'; // Amber/Red badge for < 75%
  }
};

const DeanPerformanceView = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    deanApi.getMyPerformance()
      .then((data) => { if (mounted) setReport(data || {}); })
      .catch((loadError) => { if (mounted) setError(loadError?.message || 'Unable to load your performance.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading your performance...</section>;
  if (error) return <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">{error}</section>;

  // RENDERING LOGIC
  const feedback = report?.feedback || {};
  const breakdown = report?.breakdown || {};
  const assignedCourseCount = Number(report?.assignedCourseCount || 0);
  const hasCourseAssigned = assignedCourseCount > 0
    || report?.isTeaching === true
    || report?.hasAssignedCourses === true
    || report?.hasCourseAssigned === true;
  const isComplete = report?.isComplete === true;
  const locallyCalculatedScore = calculateDeanPerformanceScore({
    student: breakdown.student?.rawPercentage || 0,
    directorate: breakdown.directorate?.rawPercentage || 0,
    peer: breakdown.peer?.rawPercentage || 0,
    hasAssignedCourses: hasCourseAssigned,
  });
  const totalWeightedScore = isComplete
    ? Number(report?.totalWeightedScore ?? report?.totalScore ?? locallyCalculatedScore.totalScore)
    : null;
  const status = isComplete ? (report?.status || 'At Risk') : 'Pending Complete Evaluation';
  
  // Define evaluation cards in order: Student, Directorate, Peer
  const breakdownItems = [
    { key: 'student', label: 'Student Evaluation' },
    { key: 'directorate', label: 'Directorate Evaluation' },
    { key: 'peer', label: 'Peer Evaluation' },
  ];
  
  // Helper to render feedback lists
  const renderList = (items, emptyText) => {
    // Ensure items is an array
    const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
    return (
      <ul className="space-y-3 text-sm">
        {itemArray.length > 0 ? (
          itemArray.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <span>•</span>
              <span>{item}</span>
            </li>
          ))
        ) : (
          <li>{emptyText}</li>
        )}
      </ul>
    );
  };

  return (
    <section className="space-y-6" aria-labelledby="dean-performance-title">
      {/* SECTION 1: TOTAL WEIGHTED SCORE HEADER */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Weighted Evaluation Score</p>
            <p id="dean-performance-title" className="mt-1 text-5xl font-bold text-ieps-blue-700">
              {isComplete ? formatScore(totalWeightedScore) : 'Pending Completion'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {!hasCourseAssigned
                ? `Directorate and Peer subtotal: ${formatScore(report?.weightedSubtotal ?? locallyCalculatedScore.weightedSubtotal)} / 50% active weight, rescaled to 100%`
                : '100% total weight'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasCourseAssigned ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                Role: Teaching (100% Weight)
              </span>
            ) : (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                Role: Non-Teaching (Re-scaled to 100%)
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isComplete ? getStatusBadgeClass(status) : 'bg-amber-100 text-amber-700'}`}>
              {status}
            </span>
          </div>
        </div>
        {!isComplete && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {`The total weighted score will be available after ${hasCourseAssigned ? 'Student, Peer, and Directorate' : 'Peer and Directorate'} evaluations are complete.`}
        </div>}
      </div>

      {/* SECTION 2: EVALUATION CARDS - STUDENT, DIRECTORATE, PEER */}
      <div className="grid gap-4 md:grid-cols-3">
        {breakdownItems.map((item) => {
          const score = breakdown[item.key] || {};
          const isStudentEvaluation = item.key === 'student';
          const isNA = isStudentEvaluation && !hasCourseAssigned;
          const weight = isStudentEvaluation
            ? (hasCourseAssigned ? 50 : 0)
            : (score.weight ?? (item.key === 'directorate' ? 30 : 20));
          const rawPercentage = Number(score.rawPercentage ?? 0);
          const weightedContribution = Number((rawPercentage * weight / 100).toFixed(2));

          return (
            <section key={item.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {/* Card Header: Label + Weight Badge */}
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">{item.label}</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {weight}% weight
                </span>
              </div>

              {/* Card Body: Raw Score or N/A */}
              {isNA ? (
                // CASE A: NO COURSE ASSIGNED - Show N/A
                <>
                  <p className="mt-4 text-3xl font-bold text-amber-600">N/A</p>
                  <p className="mt-1 text-sm text-slate-500">N/A - Non-Teaching Role</p>
                </>
              ) : (
                // CASE B: HAS COURSE OR NOT STUDENT CARD - Show Raw Percentage
                <>
                  <p className="mt-4 text-3xl font-bold text-ieps-blue-700">{formatScore(rawPercentage)}</p>
                  <p className="mt-1 text-sm text-slate-500">Raw percentage</p>
                </>
              )}

              {/* Card Footer: Weighted Contribution */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-sm text-slate-500">Weighted contribution</p>
                <p className="text-xl font-bold text-slate-900">
                  {isNA ? 'N/A' : formatScore(weightedContribution)}
                </p>
              </div>
            </section>
          );
        })}
      </div>

      {/* SECTION 3: STRENGTHS & IMPROVEMENTS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-emerald-950">
          <h3 className="mb-4 text-lg font-bold text-emerald-800">Strengths &amp; Positive Highlights</h3>
          {renderList(feedback.strengths, 'No strengths have been recorded yet.')}
        </section>
        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6 text-amber-950">
          <h3 className="mb-4 text-lg font-bold text-amber-800">Areas for Improvement</h3>
          {renderList(feedback.improvements, 'No improvement areas have been recorded yet.')}
        </section>
      </div>
    </section>
  );
};

export default DeanPerformanceView;
