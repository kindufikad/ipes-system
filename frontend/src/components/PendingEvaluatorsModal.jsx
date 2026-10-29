import { AlertTriangle, CheckCircle2, Send, UserCheck, X } from 'lucide-react';

const groupStudents = (students) => students.reduce((groups, student, index) => {
  const normalizedStudent = {
    ...student,
    student_db_id: student.student_db_id || student.evaluator_id || `student-${index}`,
  };
  const year = normalizedStudent.year_level || 'Unknown Year';
  const section = String(normalizedStudent.section || 'Unknown Section').replace(/^section\s*/i, '');
  const key = `${year} - Section ${section}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(normalizedStudent);
  return groups;
}, {});

const PendingEvaluatorsModal = ({ details, onClose, onRemind, onRemindSection, onRemindAllPeers, onEvaluateNow, reminderSending = false }) => {
  if (!details) return null;
  const groupedStudents = groupStudents(details.students || []);
  const peers = (details.peers || []).map((peer, index) => ({
    ...peer,
    peer_id: peer.peer_id || peer.evaluator_id || `peer-${index}`,
  }));
  const hasPendingDeptHead = (details.deptHeads || []).length > 0;
  const instructorName = details.row?.instructor_name || details.row?.full_name || 'this staff member';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pending-evaluators-title">
    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Pending Evaluators</p><h2 id="pending-evaluators-title" className="mt-1 text-xl font-bold text-slate-900">{instructorName}</h2></div><button type="button" onClick={onClose} aria-label="Close pending evaluators modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X /></button></div>
      {hasPendingDeptHead && <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-red-600" /><div><p className="font-bold">Action Required: You have not evaluated this instructor yet.</p><p className="mt-1 text-sm text-red-700">Complete your Department Head evaluation to finish this staff member's review.</p></div></div><button type="button" onClick={() => onEvaluateNow?.(details.row)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"><UserCheck size={16} /> Evaluate Now</button></div>}
      <div className="mt-6 space-y-7">
        <section><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-slate-900">Pending Students <span className="ml-1 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{details.students?.length || 0}</span></h3></div>{Object.keys(groupedStudents).length ? <div className="mt-3 space-y-4">{Object.entries(groupedStudents).map(([group, students]) => <div key={group} className="rounded-xl border border-slate-200"><div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3"><p className="font-semibold text-slate-800">{group} <span className="ml-1 text-sm font-normal text-amber-700">({students.length} Pending)</span></p><button type="button" onClick={() => onRemindSection?.(students, instructorName)} disabled={reminderSending} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Send size={13} /> Remind All Pending Students in Section</button></div><div className="divide-y divide-slate-100">{students.map((student) => <div key={student.evaluator_id || student.student_db_id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium text-slate-900">{student.first_name || student.student_name || 'Unknown Student'} {student.last_name || ''} <span className="text-sm font-normal text-slate-500">(ID: {student.student_id || student.user_id || student.student_db_id || 'N/A'})</span></p><p className="text-xs text-slate-500">{student.course_code ? `${student.course_code} - ${student.course_name || 'Course'}` : (student.status || 'Pending')}</p></div><button type="button" onClick={() => onRemind?.(student.evaluator_id, 'student', instructorName, student.student_name)} disabled={reminderSending || !student.evaluator_id} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Send size={13} /> Remind Student</button></div>)}</div></div>)}</div> : <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> All students have submitted.</p>}</section>
        <section><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-slate-900">Pending Peers / Instructors <span className="ml-1 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{peers.length}</span></h3>{peers.length > 0 && <button type="button" onClick={() => onRemindAllPeers?.(peers, instructorName)} disabled={reminderSending} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Send size={13} /> Remind All Peers</button>}</div>{peers.length ? <div className="mt-3 divide-y rounded-xl border border-slate-200">{peers.map((peer) => <div key={peer.evaluator_id || peer.peer_id} className="flex items-center justify-between gap-3 px-4 py-3"><p className="font-medium text-slate-900">{peer.first_name || peer.peer_instructor || peer.name || 'Unknown Instructor'} {peer.last_name || ''} <span className="text-sm font-normal text-slate-500">(Staff ID: {peer.staff_id || peer.user_id || 'N/A'})</span></p><button type="button" onClick={() => onRemind?.(peer.evaluator_id, 'peer', instructorName, peer.peer_instructor)} disabled={reminderSending || !peer.evaluator_id} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Send size={13} /> Remind Instructor</button></div>)}</div> : <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> All peers have submitted.</p>}</section>
      </div>
    </div>
  </div>;
};

export default PendingEvaluatorsModal;
