import { AlertCircle, Clock3, Download, Search, Send, UserCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const normalizeStatus = (value) => String(value || 'pending').trim().toLowerCase();
const formatName = (value, fallback = 'Unknown') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const renderStatusBadge = (status) => {
  const normalized = normalizeStatus(status);
  const completed = ['submitted', 'completed', 'approved'].includes(normalized);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{completed ? 'Completed' : 'Pending'}</span>;
};

const InstructorTrackingModal = ({ details, loading = false, onClose, onSendReminder, onEvaluateNow, reminderSending = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const students = Array.isArray(details?.students) ? details.students : [];
  const peers = Array.isArray(details?.peers) ? details.peers : [];
  const isLabAssistant = String(details?.row?.role || '').trim().toLowerCase() === 'lab assistant';
  const instructorName = details?.row?.instructorName || details?.instructorName || 'this instructor';

  const assignedStudentsCount = Number(details?.assignedStudentsCount ?? details?.totalAssignedStudents ?? students.length ?? 0);
  const pendingStudentsCount = Number(details?.pendingStudentsCount ?? students.filter((student) => !['submitted', 'completed', 'approved'].includes(normalizeStatus(student.status || student.submission_status))).length ?? 0);
  const assignedPeersCount = Number(details?.assignedPeersCount ?? details?.totalAssignedPeers ?? peers.length ?? 0);
  const pendingPeersCount = Number(details?.pendingPeersCount ?? peers.filter((peer) => !['submitted', 'completed', 'approved'].includes(normalizeStatus(peer.submission_status || peer.status))).length ?? 0);
  const totalPending = pendingStudentsCount + pendingPeersCount;

  const filterRows = (rows, type) => rows.filter((row) => {
    const name = type === 'student'
      ? formatName(row.student_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(), 'Unknown Student')
      : formatName(row.peer_instructor || `${row.first_name || ''} ${row.last_name || ''}`.trim(), 'Unknown Instructor');
    const id = type === 'student'
      ? String(row.student_id || row.student_db_id || row.user_id || '')
      : String(row.staff_id || row.user_id || row.evaluator_id || '');
    const status = normalizeStatus(type === 'student' ? (row.status || row.submission_status || 'pending') : (row.submission_status || row.status || 'pending'));
    const matchesSearch = !searchTerm || `${name} ${id}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' ? !['submitted', 'completed', 'approved'].includes(status) : ['submitted', 'completed', 'approved'].includes(status));
    return matchesSearch && matchesStatus;
  });

  const visibleStudents = useMemo(() => filterRows(students, 'student'), [students, searchTerm, statusFilter]);
  const visiblePeers = useMemo(() => filterRows(peers, 'peer'), [peers, searchTerm, statusFilter]);

  if (!details) return null;

  const exportCsv = () => {
    const csvRows = [
      ['Type', 'Name', 'ID', 'Course Code', 'Target Staff', 'Status'],
      ...visibleStudents.map((row) => ['Student', formatName(row.student_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(), 'Unknown Student'), row.student_id || row.student_db_id || row.user_id || '', row.course_code || 'N/A', row.target_instructor_name || instructorName, row.status || 'Pending']),
      ...visiblePeers.map((row) => ['Peer', formatName(row.peer_instructor || `${row.first_name || ''} ${row.last_name || ''}`.trim(), 'Unknown Instructor'), row.staff_id || row.user_id || row.evaluator_id || '', row.course_code || 'N/A', row.target_instructor_name || instructorName, row.submission_status || row.status || 'Pending']),
    ];
    const csvContent = csvRows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const file = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(file);
    link.href = url;
    link.download = `evaluation-progress-${instructorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="instructor-tracking-title">
    <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">{isLabAssistant ? 'LAB ASSISTANT EVALUATION DETAILS' : 'INSTRUCTOR EVALUATION DETAILS'}</p>
          <h2 id="instructor-tracking-title" className="mt-1 text-xl font-bold text-slate-900">{instructorName}</h2>
          <p className="mt-1 text-sm text-slate-500">Review evaluator progress, filter by status, and send tailored reminders for outstanding submissions.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close instructor tracking modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X /></button>
      </div>

      {loading ? <div className="mt-6 space-y-4" aria-label="Loading instructor evaluation details"><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-40 animate-pulse rounded-xl bg-slate-100" /><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></div> : <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => onSendReminder?.({ audience: 'all', instructorId: details.row?.instructorId || details.row?.instructor_id || details.row?.evaluatee_id, type: 'all' })} disabled={reminderSending || totalPending === 0} title={totalPending === 0 ? 'No pending evaluators to remind' : 'Send email/system reminders to pending evaluators'} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} /> {reminderSending ? 'Sending reminders...' : 'Send Automated Reminder Notification'}</button>
            <button type="button" onClick={() => onEvaluateNow?.(details.row)} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"><UserCheck size={16} /> Evaluate Now</button>
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"><Download size={16} /> Export Evaluation Progress (.CSV)</button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name or ID" className="w-52 border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {['all', 'pending', 'completed'].map((option) => <button key={option} type="button" onClick={() => setStatusFilter(option)} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${statusFilter === option ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{option === 'all' ? 'All' : option === 'pending' ? 'Pending' : 'Completed'}</button>)}
        </div>

        <section className="mt-6"><h3 className="text-lg font-bold text-slate-900">Students Status <span className="ml-1 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{pendingStudentsCount} Pending</span></h3>{assignedStudentsCount === 0 ? null : visibleStudents.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No students match the current search or status filter.</p> : <><p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"><AlertCircle size={16} /> {pendingStudentsCount} out of {assignedStudentsCount} students are pending.</p><div className="mt-3 overflow-hidden rounded-xl border border-slate-200"><table className="min-w-full border-collapse text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 font-semibold text-slate-700">Student Name</th><th className="px-4 py-3 font-semibold text-slate-700">Student ID</th><th className="px-4 py-3 font-semibold text-slate-700">Course Code</th><th className="px-4 py-3 font-semibold text-slate-700">Target Staff</th><th className="px-4 py-3 font-semibold text-slate-700">Status</th><th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 bg-white">{visibleStudents.map((student, index) => { const status = student.status || 'Pending'; const isCompleted = ['submitted', 'completed', 'approved'].includes(normalizeStatus(status)); return <tr key={`${student.student_db_id ?? student.id ?? student.student_id ?? 'student'}-${student.course_code ?? student.assignment_id ?? 'course'}-${index}`} className="align-middle"><td className="px-4 py-3"><p className="font-medium text-slate-900">{formatName(student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(), 'Unknown Student')}</p></td><td className="px-4 py-3 text-slate-600">{student.student_id || student.user_id || 'N/A'}</td><td className="px-4 py-3 text-slate-600">{student.course_code || 'N/A'}</td><td className="px-4 py-3 text-slate-600">{student.target_instructor_name || instructorName}</td><td className="px-4 py-3">{renderStatusBadge(status)}</td><td className="px-4 py-3 text-right"><button type="button" disabled={isCompleted || reminderSending} onClick={() => onSendReminder?.({ ...student, type: 'student', instructorId: details.row?.instructorId || details.row?.instructor_id || details.row?.evaluatee_id })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isCompleted ? 'Completed' : 'Send Reminder'}</button></td></tr>; })}</tbody></table></div></>}
        </section>

        <section className="mt-6">
          <h3 className="text-lg font-bold text-slate-900">Peer Status <span className="ml-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">{pendingPeersCount} Pending</span></h3>
          {assignedPeersCount === 0 ? null : visiblePeers.length === 0 ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No peer evaluators match the current search or status filter.</p>
          ) : (
            <>
              <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"><AlertCircle size={16} /> {pendingPeersCount} out of {assignedPeersCount} peer evaluators pending.</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50"><tr><th className="px-4 py-3 font-semibold text-slate-700">Peer Name</th><th className="px-4 py-3 font-semibold text-slate-700">Staff ID</th><th className="px-4 py-3 font-semibold text-slate-700">Course Code</th><th className="px-4 py-3 font-semibold text-slate-700">Target Staff</th><th className="px-4 py-3 font-semibold text-slate-700">Status</th><th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-200 bg-white">{visiblePeers.map((peer, index) => {
                    const status = peer.submission_status || peer.status || 'Pending';
                    const isCompleted = ['submitted', 'completed', 'approved'].includes(normalizeStatus(status));
                    return <tr key={`${peer.peer_id ?? peer.id ?? peer.evaluator_id ?? 'peer'}-${peer.course_code ?? peer.peer_id ?? 'course'}-${index}`} className="align-middle">
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{formatName(peer.peer_instructor || `${peer.first_name || ''} ${peer.last_name || ''}`.trim(), 'Unknown Instructor')}</p></td>
                      <td className="px-4 py-3 text-slate-600">{peer.staff_id || peer.user_id || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-600">{peer.course_code || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-600">{peer.target_instructor_name || instructorName}</td>
                      <td className="px-4 py-3">{renderStatusBadge(status)}</td>
                      <td className="px-4 py-3 text-right"><button type="button" disabled={isCompleted || reminderSending} onClick={() => onSendReminder?.({ ...peer, type: 'peer', instructorId: details.row?.instructorId || details.row?.instructor_id || details.row?.evaluatee_id })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isCompleted ? 'Completed' : 'Send Reminder'}</button></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900"><Clock3 className="mt-0.5 shrink-0 text-indigo-600" /><div><p className="font-semibold">Department Head Evaluation</p><p className="mt-1 text-sm">Use the direct action above to capture the department head evaluation for this instructor and complete the assessment cycle.</p></div></div>
      </>}
    </div>
  </div>;
};

export default InstructorTrackingModal;
