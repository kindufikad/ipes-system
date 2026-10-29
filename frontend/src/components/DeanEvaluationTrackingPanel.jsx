import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { deanApi, evaluationApi } from '../services/api';
import { useEvaluation } from '../context/useEvaluation';
import { YEAR_LEVEL_ASSIGNMENT_OPTIONS } from '../data/adminOptions';

const round = (value) => Number(Number(value || 0).toFixed(2));

const calculateWeightedDepartmentHeadScore = (row = {}) => {
  const studentAverage = Number(row.student_average ?? row.studentScore ?? 0);
  const deptHeadAverage = Number(row.dept_head_average ?? row.department_head_average ?? row.dept_head_score ?? 0);
  const peerAverage = Number(row.peer_average ?? row.peerScore ?? 0);
  const rawHasAssignedCourse = row.hasCourseAssigned ?? row.has_course_assigned ?? row.has_assigned_course ?? row.hasAssignedCourse ?? '1';
  const hasAssignedCourse = String(rawHasAssignedCourse).toLowerCase() !== 'false' && String(rawHasAssignedCourse) !== '0' && Number(rawHasAssignedCourse) !== 0;

  const normalizedDeptHead = row.dept_head_is_normalized
    ? Math.min(deptHeadAverage, 100)
    : deptHeadAverage <= 30
      ? (deptHeadAverage / 30) * 100
      : Math.min(deptHeadAverage, 100);
  const normalizedPeer = peerAverage <= 100 ? peerAverage : Math.min(peerAverage, 100);

  const weightedSubtotal = (hasAssignedCourse ? studentAverage * 0.5 : 0)
    + normalizedDeptHead * 0.3
    + normalizedPeer * 0.2;
  const fallbackWeightedScore = hasAssignedCourse
    ? weightedSubtotal
    : (weightedSubtotal / 0.5) * 100;
  return {
    studentAverage,
    deptHeadAverage,
    peerAverage,
    normalizedDeptHead,
    normalizedPeer,
    hasAssignedCourse,
    activeWeight: hasAssignedCourse ? 100 : 50,
    rawSubtotal: round(weightedSubtotal),
    weightedScore: round(fallbackWeightedScore),
    warning: hasAssignedCourse ? '' : 'Student evaluation is excluded because no course was assigned for this semester.',
  };
};

const DeanEvaluationTrackingPanel = () => {
  const [allRows, setAllRows] = useState([]);
  const [departmentHeads, setDepartmentHeads] = useState([]);
  const [selectedDepartmentHeadId, setSelectedDepartmentHeadId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [batchYear, setBatchYear] = useState('All Batches');
  const { refreshVersion } = useEvaluation();

  useEffect(() => {
    let mounted = true;
    const loadTracking = async () => {
      setLoading(true);
      setError('');
      setMessage('');

      try {
        const [trackingResponse, departmentHeadResponse] = await Promise.all([
          deanApi.getEvaluationTracking(),
          deanApi.getDepartmentHeadsForEvaluation(),
        ]);

        if (!mounted) return;
        setAllRows(Array.isArray(trackingResponse) ? trackingResponse : []);
        setDepartmentHeads(Array.isArray(departmentHeadResponse) ? departmentHeadResponse : []);
      } catch (requestError) {
        if (!mounted) return;
        setAllRows([]);
        setDepartmentHeads([]);
        setError(requestError?.message || 'Unable to load evaluation tracking.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadTracking();
    return () => { mounted = false; };
  }, [refreshVersion]);

  const filteredRows = useMemo(() => {
    if (selectedDepartmentHeadId === 'all') return allRows;

    const selectedHead = departmentHeads.find((head) => String(head.department_head_id ?? head.instructor_id) === String(selectedDepartmentHeadId));
    if (!selectedHead) return allRows;

    const targetDepartment = selectedHead.department || selectedHead.department_name || '';
    const targetName = selectedHead.department_head_name || selectedHead.name || '';

    return allRows.filter((row) => {
      const departmentMatches = !targetDepartment || row.department === targetDepartment;
      const headMatches = !targetName || row.department_head_name === targetName;
      return departmentMatches || headMatches;
    });
  }, [allRows, departmentHeads, selectedDepartmentHeadId]);

  const handleFetch = async () => {
    setFetching(true);
    setError('');
    setMessage('');

    try {
      const data = await deanApi.getEvaluationTracking();
      const nextRows = Array.isArray(data) ? data : [];
      setAllRows(nextRows);

      if (!nextRows.length) {
        setMessage('No evaluation tracking results are available for your college right now.');
      } else {
        setMessage('Evaluation tracking data refreshed successfully.');
      }
    } catch (requestError) {
      setError(requestError?.message || 'Unable to refresh evaluation tracking.');
    } finally {
      setFetching(false);
    }
  };

  const readyToPublish = filteredRows.length > 0
    && filteredRows.every((row) => Number(row.completion_rate || 0) >= 100);

  const handlePublish = async () => {
    if (!readyToPublish) {
      toast.error('Peer and Directorate evaluations must be complete before publishing results.');
      return;
    }

    const departmentIds = [...new Set(filteredRows.map((row) => Number(row.department_id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!departmentIds.length) {
      toast.error('No publishable department is available for the selected Department Head.');
      return;
    }

    setPublishing(true);
    try {
      for (const targetDepartmentId of departmentIds) {
        await evaluationApi.publishStudent({
          department_id: targetDepartmentId,
          academic_year: String(new Date().getFullYear()),
          semester: 'Semester I',
          batchYear,
        });
      }
      setShowPublishModal(false);
      toast.success('Evaluation results published successfully for the selected target batch.');
      setMessage(`Evaluation results were published for ${batchYear}.`);
    } catch (publishError) {
      console.error('Dean evaluation results publishing failed:', publishError);
      toast.error(publishError?.message || 'Unable to publish evaluation results.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Evaluation Tracking</h2>
          <p className="mt-1 text-sm text-slate-500">Track completion, weighted department-head scores, and final totals across your college.</p>
        </div>

        <div className="flex w-full flex-col gap-3 md:max-w-xl md:flex-row md:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Department Head</span>
            <select
              value={selectedDepartmentHeadId}
              onChange={(event) => setSelectedDepartmentHeadId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="all">All Department Heads</option>
              {departmentHeads.map((head) => (
                <option key={`${head.department_head_id ?? head.instructor_id ?? head.department ?? head.department_head_name}`} value={String(head.department_head_id ?? head.instructor_id ?? head.department ?? head.department_head_name)}>
                  {head.department_head_name || head.name || 'Department Head'}
                  {head.department ? ` - ${head.department}` : ''}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleFetch}
            disabled={fetching}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {fetching ? 'Fetching...' : 'Fetch Data'}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Department Head</th>
              <th className="px-4 py-3">Completion</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Dept. Head</th>
              <th className="px-4 py-3">Peer</th>
              <th className="px-4 py-3">Final Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-slate-500">Loading evaluation tracking...</td>
              </tr>
            ) : filteredRows.length ? filteredRows.map((row) => {
              const summary = calculateWeightedDepartmentHeadScore(row);
              return (
                <tr key={`${row.instructor_id ?? row.department_head_id ?? row.department_id ?? row.department_head_name}`}>
                  <td className="px-4 py-4 font-medium text-slate-900">{row.department || 'Unassigned Department'}</td>
                  <td className="px-4 py-4 text-slate-700">{row.department_head_name || '—'}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${Number(row.completion_rate ?? 0) >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {row.completed_evaluations ?? 0}/{row.total_instructors ?? 0} ({Number(row.completion_rate ?? 0).toFixed(0)}%)
                      </span>
                      <span className={`text-xs font-medium ${Number(row.completion_rate ?? 0) >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {Number(row.completion_rate ?? 0) >= 100 ? 'Ready to Publish' : 'Pending Completion'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {String(row.hasCourseAssigned ?? row.has_course_assigned ?? row.has_assigned_course ?? '1') === '0' || String(row.hasCourseAssigned ?? row.has_course_assigned ?? row.has_assigned_course ?? '1') === 'false'
                      ? 'N/A'
                      : `${summary.studentAverage.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{summary.deptHeadAverage.toFixed(2)}</td>
                  <td className="px-4 py-4 text-slate-700">{summary.peerAverage.toFixed(2)}</td>
                  <td className="px-4 py-4 font-bold text-blue-700">{summary.weightedScore.toFixed(1)}%</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="7" className="px-4 py-10 text-center text-slate-500">No evaluation tracking data is available for this selection.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900">Final results status</p>
            <p className="mt-1 text-sm text-blue-700">
              {readyToPublish
                ? `${filteredRows.length} department-head record(s) have completed their active evaluation categories and are ready to publish.`
                : filteredRows.length
                  ? 'Publishing becomes available after the active evaluation categories are 100% complete.'
                : 'No department-head records are available for final publishing.'}
            </p>
          </div>

          {readyToPublish && (
            <button
              type="button"
              onClick={() => setShowPublishModal(true)}
              disabled={publishing}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish Evaluation Results
            </button>
          )}
        </div>
      </div>
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dean-publish-batch-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="dean-publish-batch-title" className="text-lg font-bold text-slate-900">Confirm &amp; Publish</h3>
            <p className="mt-2 text-sm text-slate-600">Select the target academic year/batch for these completed evaluation results.</p>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Target Academic Year / Batch
              <select value={batchYear} onChange={(event) => setBatchYear(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                {YEAR_LEVEL_ASSIGNMENT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                <option value="All Batches">All Batches</option>
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowPublishModal(false)} disabled={publishing} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void handlePublish()} disabled={publishing || !readyToPublish} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{publishing ? 'Publishing...' : 'Confirm & Publish'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DeanEvaluationTrackingPanel;
