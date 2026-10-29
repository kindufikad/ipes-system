import { useEffect, useMemo, useState } from 'react';
import CertificateModal from './CertificateModal';
import { getReportCompletion } from '../utils/reportCompletion';
import { evaluationApi } from '../services/api';
import { printDocument } from '../utils/printDocument';

const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace(/\s+/g, '_');

const DepartmentResultCertificates = ({ rows: initialRows = [], currentUser, academicYear: initialAcademicYear = '2025/2026', semester: initialSemester = 'Semester II', onRefresh }) => {
  const rows = initialRows;
  const [academicYear] = useState(initialAcademicYear);
  const [semester] = useState(initialSemester);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const role = normalizeRole(currentUser?.role);
  const isDepartmentRole = ['depthead', 'dept_head', 'department_head', 'college_dean', 'dean'].includes(role);
  const eligibleRows = useMemo(() => rows.filter((row) => {
    const rowRole = normalizeRole(row.role || row.target_role);
    return ['instructor', 'lab_assistant'].includes(rowRole);
  }), [rows]);
  const totalItems = eligibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const currentRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return eligibleRows.slice(startIndex, startIndex + itemsPerPage);
  }, [eligibleRows, currentPage, itemsPerPage]);
  const startRecord = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(currentPage * itemsPerPage, totalItems);

  useEffect(() => {
    setCurrentPage(1);
  }, [initialRows]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleRowsPerPageChange = (event) => {
    setItemsPerPage(Number(event.target.value));
    setCurrentPage(1);
  };

  const isIndividualCompleted = (instructor = {}) => {
    const rowRole = normalizeRole(instructor.role || instructor.target_role);
    if (!['instructor', 'lab_assistant'].includes(rowRole)) return false;
    return getReportCompletion(instructor).canPrint;
  };

  const openLetter = async (instructor) => {
    if (!isIndividualCompleted(instructor)) {
      const completion = getReportCompletion(instructor);
      window.alert(completion.message || 'Evaluation is still pending for this instructor.');
      return;
    }
    let report = instructor;
    const instructorId = instructor?.instructor_id || instructor?.instructorId || instructor?.id;
    if (instructorId) {
      try {
        report = { ...instructor, ...await evaluationApi.getPrintEfficiencyReport(instructorId, { academic_year: academicYear, semester, target_role: instructor.role }) };
      } catch (error) {
        console.error('Unable to refresh printable evaluation report:', error);
        window.alert('Unable to refresh the complete evaluation result for printing.');
        return;
      }
    }
    if (!isIndividualCompleted(report)) {
      const refreshedCompletion = getReportCompletion(report);
      window.alert(refreshedCompletion.message || 'Evaluation is still pending for this instructor.');
      return;
    }
    setSelectedInstructor({
      ...report,
      name: report.name || report.full_name || report.instructor_name || report.instructorName,
      role: report.role || instructor.role || report.target_role,
      department_name: report.department_name || report.department,
      student_score: report.student_score ?? report.student_average ?? report.studentScore,
      peer_score: report.peer_score ?? report.peer_average ?? report.peerScore,
      dept_head_score: report.dept_head_score ?? report.deptHeadScore ?? report.department_score,
      final_score: report.final_score ?? report.finalScore ?? report.total_score ?? report.totalScore ?? report.totalWeightedScore ?? report.score,
      academic_year: report.academic_year || report.academicYear,
      semester: report.semester || report.term,
    });
    setIsPrinting(true);
  };

  useEffect(() => {
    if (!isPrinting || !selectedInstructor) return undefined;
    let cancelled = false;
    const printAfterRender = async () => {
      if (cancelled) return;
      try {
        await printDocument('printing-official-report', () => {
          if (cancelled) return;
          setIsPrinting(false);
        });
      } catch (error) {
        console.error('Unable to open print preview:', error);
        setIsPrinting(false);
      }
    };
    const firstFrame = window.requestAnimationFrame(() => window.requestAnimationFrame(printAfterRender));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
    };
  }, [isPrinting, selectedInstructor]);

  if (!isDepartmentRole) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Department Result Certificates</h2>
          <p className="mt-1 text-sm text-gray-500">Review and export official department results.</p>
        </div>
      </header>

      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Total Staff" value={rows.length} />
          <Metric label="Department Average Score" value={average(rows).toFixed(2)} />
          <Metric label="Highest Score" value={score(rows, 'max')} />
          <Metric label="Lowest Score" value={score(rows, 'min')} />
        </div>
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-5 dark:border-slate-700 md:flex-row md:items-center"><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Department Evaluation Summary</h3><p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Final calculated results for instructors and lab assistants in this department.</p></div><button type="button" onClick={onRefresh} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Refresh</button></div>
          <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-slate-700/50 dark:text-slate-300"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Final Score</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-700">{currentRows.length ? currentRows.map((row) => { const individualCompleted = isIndividualCompleted(row); return <tr key={row.id || `${row.role}-${row.name}`} className="text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700/30"><td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{row.full_name || row.name || row.instructorName}</td><td className="px-4 py-4">{row.role || 'Instructor'}</td><td className="px-4 py-4">{row.department_name || row.department || currentUser?.department_name || 'N/A'}</td><td className="px-4 py-4 font-bold">{Number(row.final_score ?? row.finalScore ?? 0).toFixed(2)}</td><td className="px-4 py-4"><div className="flex flex-wrap items-center gap-2"><button type="button" title={individualCompleted ? 'Export or Print Instructor Performance Report' : 'Evaluation still pending for this instructor'} onClick={() => openLetter(row)} disabled={!individualCompleted} className={individualCompleted ? 'cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95' : 'cursor-not-allowed rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-400 opacity-60'}>Export / Print</button>{!individualCompleted ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pending Submissions</span> : null}</div></td></tr>; }) : <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">No evaluation summary records found.</td></tr>}</tbody></table></div>
          <div className="flex flex-col gap-4 border-t border-gray-100 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <span>Showing <strong className="text-gray-900 dark:text-white">{startRecord}</strong> to <strong className="text-gray-900 dark:text-white">{endRecord}</strong> of <strong className="text-gray-900 dark:text-white">{totalItems}</strong> results</span>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400" htmlFor="department-report-rows">Rows:
                <select id="department-report-rows" value={itemsPerPage} onChange={handleRowsPerPageChange} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1" aria-label="Department report pagination">
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Previous</button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${currentPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'}`}>{page}</button>)}
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700">Next</button>
            </div>
          </div>
        </section>
      </>

      {isPrinting && <div className="official-report-shell">
        <div className="printable-certificate-container">
          <CertificateModal
            departmentName={currentUser?.department_name || currentUser?.department}
            departmentHeadName={currentUser?.full_name || currentUser?.name || currentUser?.username}
            academicYear={academicYear}
            semester={semester}
            reportRow={selectedInstructor}
            reportDate={new Date().toLocaleDateString()}
          />
        </div>
      </div>}
    </div>
  );
};

const Metric = ({ label, value }) => <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-blue-600">{value}</p></div>;
const numericScores = (rows) => rows.map((row) => Number(row.final_score ?? row.finalScore ?? 0)).filter((value) => value > 0);
const average = (rows) => { const values = numericScores(rows); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; };
const score = (rows, mode) => { const values = numericScores(rows); return values.length ? Math[mode](...values).toFixed(2) : '0.00'; };

export default DepartmentResultCertificates;
