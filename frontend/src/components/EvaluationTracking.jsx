import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Eye, Filter, RefreshCw, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { evaluationApi, notificationApi } from '../services/api';
import InstructorTrackingModal from './InstructorTrackingModal';

const DEFAULT_FILTERS = { searchInstructor: '', academicYear: '', section: '', program: '' };
const asNumber = (value) => Number(value || 0);
const percentage = (completed, total) => total ? Number(((completed / total) * 100).toFixed(2)) : 0;
const statusClasses = { pending: 'bg-amber-100 text-amber-700', progress: 'bg-blue-100 text-blue-700', complete: 'bg-emerald-100 text-emerald-700' };
const getProgressStatus = (value) => value <= 0
  ? { label: 'Pending', classes: statusClasses.pending }
  : value >= 100 ? { label: 'Complete', classes: statusClasses.complete } : { label: 'In Progress', classes: statusClasses.progress };

const EvaluationTracking = ({ departmentId, onEvaluateNow = () => {} }) => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeCategory, setActiveCategory] = useState('all');
  const [rows, setRows] = useState([]);
  const [summaryCards, setSummaryCards] = useState({ totalRequired: 0, completed: 0, pending: 0, overallCompletionRate: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [fetchNonce, setFetchNonce] = useState(0);
  const [pendingDetails, setPendingDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  useEffect(() => {
    let cancelled = false;
    const loadTracking = async () => {
      if (!departmentId) return;
      setLoading(true);
      setMessage('');
      try {
        const response = await evaluationApi.getDepartmentHeadEvaluationTracking({
          departmentId,
          searchInstructor: filters.searchInstructor || undefined,
          academicYear: filters.academicYear || undefined,
          section: filters.section || undefined,
          program: filters.program || undefined,
        });
        if (cancelled) return;
        setRows(Array.isArray(response?.trackingList) ? response.trackingList : []);
        setSummaryCards({
          totalRequired: asNumber(response?.summaryCards?.totalRequired),
          completed: asNumber(response?.summaryCards?.completed),
          pending: asNumber(response?.summaryCards?.pending),
          overallCompletionRate: asNumber(response?.summaryCards?.overallCompletionRate),
        });
        if (!response?.trackingList?.length) setMessage('No evaluation tracking records match the selected filters.');
      } catch (error) {
        if (!cancelled) {
          setRows([]);
          setSummaryCards({ totalRequired: 0, completed: 0, pending: 0, overallCompletionRate: 0 });
          setMessage(error?.message || 'Unable to load evaluation tracking.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadTracking();
    return () => { cancelled = true; };
  }, [departmentId, fetchNonce, filters]);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const resetFilters = () => { setFilters(DEFAULT_FILTERS); setActiveCategory('all'); };

  const categoryMetrics = useMemo(() => {
    const metrics = { student: { required: 0, completed: 0 }, peer: { required: 0, completed: 0 }, dept_head: { required: 0, completed: 0 } };
    rows.forEach((row) => {
      metrics.student.required += asNumber(row.studentCompletion?.total);
      metrics.student.completed += asNumber(row.studentCompletion?.completed);
      metrics.peer.required += asNumber(row.peerCompletion?.total);
      metrics.peer.completed += asNumber(row.peerCompletion?.completed);
      metrics.dept_head.required += 1;
      metrics.dept_head.completed += row.deptHeadStatus === 'Submitted' ? 1 : 0;
    });
    return metrics;
  }, [rows]);

  const categoryCount = (key) => {
    if (key === 'all') return { required: summaryCards.totalRequired, completed: summaryCards.completed, pending: summaryCards.pending };
    const metric = categoryMetrics[key];
    return { ...metric, pending: Math.max(metric.required - metric.completed, 0) };
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'dept_head') return row.deptHeadStatus !== 'Submitted';
    const completion = row[`${activeCategory}Completion`];
    return asNumber(completion?.completed) < asNumber(completion?.total);
  }), [activeCategory, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const indexOfLastItem = currentPage * rowsPerPage;
  const indexOfFirstItem = indexOfLastItem - rowsPerPage;
  const currentItems = filteredRows.slice(indexOfFirstItem, indexOfLastItem);
  const firstVisibleItem = filteredRows.length ? indexOfFirstItem + 1 : 0;
  const lastVisibleItem = Math.min(indexOfLastItem, filteredRows.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeCategory, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleOpenViewModal = async (instructorId, row) => {
    if (!instructorId) {
      toast.error('Unable to identify this instructor.');
      return;
    }

    setPendingDetails({ row, students: [], peers: [] });
    setDetailsLoading(true);
    try {
      const details = await evaluationApi.getDeptHeadPendingEvaluators({
        evaluatee_id: instructorId,
        target_role: row.role === 'Lab Assistant' ? 'lab_assistant' : 'instructor',
        include_completed: 1,
      });
      setPendingDetails({
        row,
        ...details,
        deptHeads: [],
      });
    } catch (error) { setPendingDetails(null); toast.error(error?.message || 'Unable to load instructor evaluation details.'); }
    finally { setDetailsLoading(false); }
  };

  const viewPending = (row) => handleOpenViewModal(row?.instructorId, row);

  const sendReminder = async (row, recipient = {}) => {
    setReminderSending(true);
    try {
      const payload = {
        instructorId: row?.instructorId,
        targetRole: row?.role === 'Lab Assistant' ? 'lab_assistant' : 'instructor',
        audience: recipient.type || recipient.audience || 'all',
        recipient_user_id: recipient.user_id || undefined,
        target_name: row?.instructorName || 'the assigned staff member',
      };
      const isBulkReminder = payload.audience === 'all' && !payload.recipient_user_id;
      const result = isBulkReminder
        ? await notificationApi.sendBulkReminders(payload)
        : await notificationApi.sendReminder(payload);
      if (isBulkReminder) {
        const sentCount = Number(result?.sentCount ?? 0);
        const unlinkedCount = Number(result?.unlinkedCount ?? 0);
        if (unlinkedCount > 0) {
          toast(`ማስታወቂያው ለ ${sentCount} ተጠቃሚዎች ደረሷል:: ${unlinkedCount} ተጠቃሚዎች የቴሌግራም ቦት ስላላያያዙ አልደረሳቸውም::`, { icon: 'ℹ️' });
        } else if (sentCount > 0) {
          toast.success('የማስታወቂያ መልእክት ለሁሉም ተላክዋል!');
        } else {
          toast('ለማሳሰብ የሚጠበቁ ተጠቃሚዎች የሉም::', { icon: 'ℹ️' });
        }
        return;
      }
      toast.success(`Reminders sent to ${result?.sent || 0} pending evaluators; ${result?.telegramSent || 0} urgent Telegram messages sent.`);
    } catch (error) { toast.error(error?.message || 'Unable to send reminders.'); }
    finally { setReminderSending(false); }
  };

  const filterOptions = { academicYear: ['2026', '2025/2026', '2024/2025'], section: ['Section A', 'Section B', 'Section C', 'Section D', 'Section E', 'Section F', 'Section G', 'Section H'], program: ['Regular', 'Extension'] };

  return <section className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['TOTAL REQUIRED SUBMISSIONS', summaryCards.totalRequired, Users, 'text-blue-700', 'bg-blue-600'],
        ['COMPLETED SUBMISSIONS', summaryCards.completed, CheckCircle2, 'text-emerald-600', 'bg-emerald-500'],
        ['PENDING SUBMISSIONS', summaryCards.pending, Clock3, 'text-amber-600', 'bg-amber-500'],
        ['OVERALL COMPLETION RATE', `${summaryCards.overallCompletionRate.toFixed(1)}%`, null, 'text-indigo-700', 'bg-indigo-600'],
      ].map(([label, value, Icon, textColor, barColor]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-3 text-3xl font-bold ${textColor}`}>{value}</p></div>{Icon ? <Icon className={`h-6 w-6 ${textColor}`} /> : <div className="h-7 w-7 rounded-full border-4 border-slate-100 border-t-indigo-600" />}</div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${label === 'OVERALL COMPLETION RATE' ? summaryCards.overallCompletionRate : percentage(Number(value), summaryCards.totalRequired)}%` }} /></div>
      </article>)}
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {['student', 'peer', 'dept_head', 'all'].map((key) => { const count = categoryCount(key); const label = key === 'dept_head' ? 'Dept Head' : key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1); const countLabel = key === 'all' ? `${count.completed}/${count.required} Total` : `${count.pending}/${count.required} Pending`; return <button key={key} type="button" onClick={() => setActiveCategory(key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeCategory === key ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label} <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">{countLabel}</span></button>; })}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-4">
      <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.searchInstructor} onChange={(event) => updateFilter('searchInstructor', event.target.value)} placeholder="Search Instructor" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm" /></label>
      {['academicYear', 'section', 'program'].map((field) => <select key={field} value={filters[field]} onChange={(event) => updateFilter(field, event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">{field === 'academicYear' ? 'All Academic Years' : field === 'section' ? 'All Sections' : 'All Programs'}</option>{filterOptions[field].map((option) => <option key={option} value={option}>{option}</option>)}</select>)}
    </div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw size={16} /> Reset Filters</button><button type="button" onClick={() => setFetchNonce((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Filter size={16} />{loading ? 'Fetching...' : 'Fetch Data'}</button></div></div>

    {message && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">INSTRUCTOR</th><th className="px-4 py-3">STUDENT COMPLETION</th><th className="px-4 py-3">PEER COMPLETION</th><th className="px-4 py-3">DEPT HEAD STATUS</th><th className="px-4 py-3">OVERALL PROGRESS</th><th className="px-4 py-3">ACTION</th></tr></thead><tbody className="divide-y divide-slate-100">
      {loading ? <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-500">Loading evaluation tracking...</td></tr> : currentItems.length ? currentItems.map((row, index) => { const student = row.studentCompletion || { completed: 0, total: 0, percentage: 0 }; const peer = row.peerCompletion || { completed: 0, total: 0, percentage: 0 }; const overall = asNumber(row.overallProgress); const progressStatus = getProgressStatus(overall); const deptSubmitted = row.deptHeadStatus === 'Submitted'; return <tr key={row.instructorId}><td className="px-4 py-4">{indexOfFirstItem + index + 1}</td><td className="px-4 py-4 font-semibold text-slate-900">{row.instructorName}<span className="mt-1 block text-xs font-normal text-slate-500">{row.role} · {row.department}</span></td><td className="px-4 py-4"><span>{student.completed}/{student.total} Students - {student.percentage.toFixed(1)}%</span><div className="mt-2 h-1.5 w-36 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, student.percentage)}%` }} /></div></td><td className="px-4 py-4"><span>{peer.completed}/{peer.total} Peers - {peer.percentage.toFixed(1)}%</span><div className="mt-2 h-1.5 w-28 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, peer.percentage)}%` }} /></div></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${deptSubmitted ? statusClasses.complete : statusClasses.pending}`}>{deptSubmitted ? 'Submitted' : 'Pending'}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${progressStatus.classes}`}>{progressStatus.label} · {overall.toFixed(1)}%</span></td><td className="px-4 py-4"><button type="button" onClick={() => void viewPending(row)} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Eye size={15} /> View</button></td></tr>; }) : <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-500">No instructors match the selected view.</td></tr>}
    </tbody></table><div className="flex flex-col gap-4 border-t border-slate-200 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-4"><span>Showing <strong className="text-slate-900">{firstVisibleItem}</strong> to <strong className="text-slate-900">{lastVisibleItem}</strong> of <strong className="text-slate-900">{filteredRows.length}</strong> results</span><label className="flex items-center gap-2 text-xs text-slate-500" htmlFor="evaluation-tracking-rows">Rows:<select id="evaluation-tracking-rows" value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></select></label></div><div className="flex items-center gap-1" aria-label="Evaluation tracking pagination"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? 'page' : undefined} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${currentPage === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{page}</button>)}<button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || !filteredRows.length} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div></div>
    <InstructorTrackingModal details={pendingDetails} loading={detailsLoading} onClose={() => setPendingDetails(null)} onSendReminder={(recipient) => void sendReminder(pendingDetails?.row, recipient)} onEvaluateNow={(row) => { setPendingDetails(null); onEvaluateNow(row); }} reminderSending={reminderSending} />
  </section>;
};

export default EvaluationTracking;