import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { evaluationApi, registrationApi } from '../services/api';
import PublishEvaluationTable from '../components/PublishEvaluationTable';
import { getYearLevelLabel, getYearLevelNumber, YEAR_LEVEL_ASSIGNMENT_OPTIONS, YEAR_LEVEL_FILTER_OPTIONS } from '../data/adminOptions';

const PublishEvaluation = ({ departmentId, role = 'dept_head' }) => {
  const isDepartmentHead = ['dept_head', 'depthead', 'department_head'].includes(String(role).toLowerCase());
  const canPublishPeer = isDepartmentHead;
  const [target, setTarget] = useState('student');
  const [assignments, setAssignments] = useState([]);
  const [filters, setFilters] = useState({ program_type: '', year_level: '', semester: '', section: '', staff_type: 'all' });
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [departmentStaff, setDepartmentStaff] = useState([]);
  const [alreadyPublished, setAlreadyPublished] = useState({ student: false, instructor: false });
  const [peerEvaluationStarted, setPeerEvaluationStarted] = useState(false);
  const [peerEvaluationFullyCompleted, setPeerEvaluationFullyCompleted] = useState(false);
  const [peerHasSubmissions, setPeerHasSubmissions] = useState(false);
  const [studentEvaluationStarted, setStudentEvaluationStarted] = useState(false);
  const [studentEvaluationFullyCompleted, setStudentEvaluationFullyCompleted] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [batchYear, setBatchYear] = useState('All Batches');
  const publishFilters = { ...filters, academic_year: new Date().getFullYear() };

  const handleUnpublish = async () => {
    const evaluationStarted = target === 'student' ? studentEvaluationStarted : peerEvaluationStarted;
    const evaluationFullyCompleted = target === 'student' ? studentEvaluationFullyCompleted : peerEvaluationFullyCompleted;
    if (target === 'instructor' && peerHasSubmissions) {
      toast.error('Peer evaluations cannot be unpublished after a submission exists.');
      return;
    }
    if (evaluationStarted && !evaluationFullyCompleted) {
      toast.error('You can only unpublish an evaluation that has not started or is fully completed.');
      return;
    }
    if (!window.confirm(target === 'student' ? 'Withdraw this student evaluation batch?' : 'Withdraw peer evaluations for this department?')) return;
    setPublishing(true);
    try {
      const payload = target === 'student'
        ? { department_id: departmentId, ...filters, academic_year: new Date().getFullYear() }
        : { department_id: departmentId, academic_year: new Date().getFullYear(), semester: 'Semester I' };
      const result = target === 'student'
        ? await evaluationApi.unpublishStudent(payload)
        : await evaluationApi.unpublishDepartmentPeerEvaluations(payload);
      setAlreadyPublished((current) => ({ ...current, [target]: false }));
      if (target === 'instructor') {
        setPeerEvaluationStarted(false);
        setPeerEvaluationFullyCompleted(false);
        setPeerHasSubmissions(false);
      } else {
        setStudentEvaluationStarted(false);
        setStudentEvaluationFullyCompleted(false);
      }
      toast.success(result?.message || 'Evaluation unpublished successfully.');
      const rows = await evaluationApi.getPublishAssignments({ department: departmentId, staff_type: filters.staff_type });
      setAssignments(Array.isArray(rows) ? rows : []);
      if (target === 'student') {
        const status = await evaluationApi.getPublishStatuses(departmentId, publishFilters);
        setStudentEvaluationStarted(Boolean(status?.studentEvaluationStarted));
        setStudentEvaluationFullyCompleted(Boolean(status?.studentEvaluationFullyCompleted));
        setAlreadyPublished((current) => ({ ...current, student: Boolean(status?.is_student_published) }));
      }
    } catch (error) {
      toast.error(error.message || 'Unable to unpublish evaluation.');
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadAssignments = async () => {
      setLoading(true);
      try {
        const rows = await evaluationApi.getPublishAssignments({ department: departmentId, staff_type: filters.staff_type });
        if (!cancelled) {
          const nextAssignments = Array.isArray(rows) ? rows : [];
          setAssignments(nextAssignments);
          if (!isDepartmentHead) {
            const instructors = [...new Map(nextAssignments.filter((row) => row.instructor_id).map((row) => [row.instructor_id, row])).values()];
            setDepartmentStaff(instructors.map((instructor) => ({ ...instructor, displayName: instructor.instructor_name || 'Instructor' })));
          }
        }
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Unable to load course assignments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (departmentId) void loadAssignments();
    return () => { cancelled = true; };
  }, [departmentId, isDepartmentHead, filters.staff_type]);

  useEffect(() => {
    let cancelled = false;
    const loadPublishStatuses = async () => {
      try {
        const status = await evaluationApi.getPublishStatuses(departmentId, publishFilters);
        const peerStatus = canPublishPeer ? await evaluationApi.getPeerPublishStatus({ department_id: departmentId, academic_year: new Date().getFullYear(), semester: 'Semester I' }) : null;
        if (!cancelled) setAlreadyPublished({
          student: Boolean(status?.is_student_published),
          instructor: Boolean(peerStatus?.isPublished || status?.is_peer_published),
        });
        if (!cancelled) {
          setPeerEvaluationStarted(Boolean(peerStatus?.hasStarted));
          setPeerEvaluationFullyCompleted(Boolean(peerStatus?.fullyCompleted));
          setPeerHasSubmissions(Boolean(peerStatus?.hasSubmissions));
          setStudentEvaluationStarted(Boolean(status?.studentEvaluationStarted));
          setStudentEvaluationFullyCompleted(Boolean(status?.studentEvaluationFullyCompleted));
        }
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Unable to load publish statuses.');
      }
    };
    if (departmentId) void loadPublishStatuses();
    return () => { cancelled = true; };
  }, [departmentId, isDepartmentHead, canPublishPeer, filters.program_type, filters.year_level, filters.semester, filters.section]);

  useEffect(() => {
    let cancelled = false;
    const loadDepartmentStaff = async () => {
      try {
        const rows = await registrationApi.getUsers();
        const staff = (Array.isArray(rows) ? rows : [])
          .filter((user) => ['instructor', 'lab_assistant', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate'].includes(String(user.role).toLowerCase()))
          .filter((user) => String(user.status || 'active').toLowerCase() === 'active')
          .map((user) => ({
            ...user,
            displayName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email || 'Unnamed Staff',
          }));
        if (!cancelled) setDepartmentStaff(staff);
      } catch (error) {
        if (!cancelled) {
          setDepartmentStaff([]);
          toast.error(error.message || 'Unable to load department instructors.');
        }
      }
    };
    if (departmentId && isDepartmentHead) void loadDepartmentStaff();
    return () => { cancelled = true; };
  }, [departmentId, isDepartmentHead]);

  const updateFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  const getStaffType = (record) => String(record.target_type || record.publish_role || record.assigned_role || record.role || '').toLowerCase() === 'lab_assistant' ? 'lab_assistant' : 'instructor';
  const matchingAssignments = assignments.filter((assignment) => filters.staff_type === 'all' || getStaffType(assignment) === filters.staff_type).filter((assignment) => Object.entries(filters).every(([field, value]) => field === 'staff_type' || !value || String(assignment[field] || '').toLowerCase() === value.toLowerCase()));
  const visibleStaff = departmentStaff.filter((staff) => filters.staff_type === 'all' || getStaffType(staff) === filters.staff_type);
  const targetAlreadyPublished = target === 'student' && !isDepartmentHead
    ? false
    : alreadyPublished[target] || (target === 'student' && matchingAssignments.some((assignment) => assignment.is_student_published));
  const targetEvaluationStarted = target === 'student' && !isDepartmentHead
    ? false
    : target === 'student' ? studentEvaluationStarted : peerEvaluationStarted;
  const targetEvaluationFullyCompleted = target === 'student' && !isDepartmentHead
    ? false
    : target === 'student' ? studentEvaluationFullyCompleted : peerEvaluationFullyCompleted;
  const canUnpublish = !targetEvaluationStarted || targetEvaluationFullyCompleted;
  const instructorCount = departmentStaff.filter((staff) => String(staff.role).toLowerCase() === 'instructor').length;
  const canPublish = !publishing
    && !loading
    && (target !== 'instructor' || instructorCount >= 1)
    && !targetAlreadyPublished
    && (!targetEvaluationStarted || targetEvaluationFullyCompleted);
  const canUnpublishTarget = target === 'instructor' ? !peerHasSubmissions : canUnpublish;
  const options = (field) => {
    const assignmentOptions = assignments.map((assignment) => assignment[field]).filter(Boolean);
    if (field !== 'year_level') return [...new Set(assignmentOptions)];
    const existingYearNumbers = new Set(assignmentOptions.map(getYearLevelNumber).filter(Boolean));
    const missingYearOptions = YEAR_LEVEL_FILTER_OPTIONS
      .filter(({ value }) => !existingYearNumbers.has(getYearLevelNumber(value)))
      .map(({ value }) => value);
    return [...new Set([...assignmentOptions, ...missingYearOptions])];
  };

  const publish = async () => {
    if (targetAlreadyPublished || (targetEvaluationStarted && !targetEvaluationFullyCompleted)) {
      toast.error(target === 'student' ? 'Evaluation form has already been published for this section/batch.' : 'Peer evaluations have already been published for this department.');
      return;
    }
    setPublishing(true);
    try {
      const payload = {
        department_id: departmentId,
        ...publishFilters,
        batchYear,
        staff_type: filters.staff_type,
      };
      const result = target === 'student'
        ? await evaluationApi.publishStudent(payload)
        : await evaluationApi.publishPeerEvaluation({
          department_id: departmentId,
          academic_year: new Date().getFullYear(),
          semester: 'Semester I',
          staff_type: filters.staff_type,
        });
      if (result?.isAlreadyPublished) {
        setAlreadyPublished((current) => ({ ...current, [target]: true }));
        toast.error(result.message || 'Evaluation has already been published.');
        return;
      }
      setAlreadyPublished((current) => ({ ...current, [target]: true }));
      toast.success(target === 'student'
        ? 'Evaluation results published successfully for the selected target batch.'
        : result?.message || `Evaluation published to ${target}s.`);
      setShowPublishModal(false);
      const rows = await evaluationApi.getPublishAssignments({ department: departmentId, staff_type: filters.staff_type });
      setAssignments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (error.response?.data?.isAlreadyPublished || error.message?.toLowerCase().includes('already published')) {
        setAlreadyPublished((current) => ({ ...current, [target]: true }));
      }
      toast.error(error.message || 'Unable to publish evaluation.');
    } finally {
      setPublishing(false);
    }
  };

  const selectClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm';
  const labels = { program_type: 'Program Type', year_level: 'Year Level', semester: 'Semester', section: 'Section' };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-2xl font-semibold text-slate-900">Publish Evaluation Form</h2><p className="mt-1 text-sm text-slate-500">Activate evaluation forms separately from course assignment.</p></div>
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            {(canPublishPeer ? ['student', 'instructor'] : ['student']).map((value) => <button key={value} type="button" onClick={() => setTarget(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${target === value ? 'bg-white text-ieps-blue-600 shadow-sm' : 'text-slate-600'}`}>{value === 'student' ? 'Student' : 'Peer Evaluation'}</button>)}
          </div>
        </div>

        {target === 'student' ? (
          <div className="mt-6 grid gap-4 md:grid-cols-5">
            {Object.entries(labels).map(([field, label]) => <label key={field} className="text-sm text-slate-600"><span className="mb-1 block font-medium">{label}</span><select value={filters[field]} onChange={updateFilter(field)} className={selectClass}><option value="">All</option>{options(field).map((option) => <option key={option} value={option}>{field === 'year_level' ? getYearLevelLabel(option) : option}</option>)}</select></label>)}
            <label className="text-sm text-slate-600"><span className="mb-1 block font-medium">Staff Type</span><select value={filters.staff_type} onChange={updateFilter('staff_type')} className={selectClass}><option value="all">All Staff Types</option><option value="instructor">Instructors Only</option><option value="lab_assistant">Lab Assistants Only</option></select></label>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">Instructor Name</th><th className="px-4 py-3 font-semibold">Role</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {visibleStaff.map((staff, index) => <tr key={staff.id} className="hover:bg-gray-50"><td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3 font-medium text-gray-800">{staff.displayName}</td><td className="px-4 py-3 capitalize">{String(staff.role).replaceAll('_', ' ')}</td></tr>)}
                {!visibleStaff.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No active academic staff found for this department.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><p className="text-sm text-gray-500">{target === 'student' ? (loading ? 'Loading assignments...' : `${matchingAssignments.length} assigned course${matchingAssignments.length === 1 ? '' : 's'} match the selected filters.`) : `${departmentStaff.length} active academic staff in this department.`}</p><div className="flex min-h-12 w-full flex-wrap items-center justify-start gap-2 md:w-auto md:min-w-[18rem] md:justify-end">{(target === 'instructor' ? !targetAlreadyPublished : canPublish) && <button type="button" onClick={() => target === 'student' ? setShowPublishModal(true) : void publish()} disabled={!canPublish} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ieps-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieps-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{publishing ? 'Publishing...' : target === 'instructor' ? 'Publish Peer Evaluation' : 'Publish Evaluation to Students'}</button>}{target === 'instructor' && !targetAlreadyPublished && instructorCount < 1 && <span className="text-right text-xs font-medium text-slate-500">At least one active instructor is required to publish peer evaluations.</span>}{targetAlreadyPublished && canUnpublishTarget && <button type="button" onClick={handleUnpublish} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300 px-5 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-50">{publishing ? 'Withdrawing...' : target === 'student' ? 'Unpublish' : 'Unpublish Peer Evaluation'}</button>}{target === 'instructor' && targetAlreadyPublished && peerHasSubmissions && <span className="text-right text-xs font-medium text-slate-500">Peer evaluations cannot be unpublished after a submission exists.</span>}</div></div>
      </div>

      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="publish-batch-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="publish-batch-title" className="text-lg font-bold text-slate-900">Confirm Evaluation Publishing</h3>
            <p className="mt-2 text-sm text-slate-600">Choose the student batch that should receive this evaluation.</p>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Target Academic Year / Batch
              <select value={batchYear} onChange={(event) => setBatchYear(event.target.value)} className={`${selectClass} mt-2`}>
                {YEAR_LEVEL_ASSIGNMENT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                <option value="All Batches">All Batches</option>
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowPublishModal(false)} disabled={publishing} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void publish()} disabled={publishing || !canPublish} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{publishing ? 'Publishing...' : 'Confirm & Publish'}</button>
            </div>
          </div>
        </div>
      )}

      {target === 'student' && (
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <PublishEvaluationTable
            departmentId={departmentId}
            filters={filters}
            refreshToken={assignments}
          />
        </div>
      )}
    </section>
  );
};

export default PublishEvaluation;
