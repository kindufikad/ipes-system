import { useState } from 'react';

export const SetGoalModal = ({ open, onClose, onSave, isSaving = false }) => {
  const [focusArea, setFocusArea] = useState('Teaching Clarity');
  const [goal, setGoal] = useState('');
  const [term, setTerm] = useState('Current term');

  if (!open) return null;
  const submit = async (event) => {
    event.preventDefault();
    if (!goal.trim()) return;
    await onSave({ focusArea, goal: goal.trim(), term: term.trim() || 'Current term' });
    setGoal('');
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="set-goal-title">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="set-goal-title" className="text-xl font-bold text-slate-900">Set Improvement Goal</h2><p className="mt-1 text-sm text-slate-500">Turn evaluation evidence into one measurable teaching goal.</p></div><button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700" aria-label="Close">&times;</button></div>
        <label className="mt-5 block text-sm font-semibold text-slate-700">Focus area<select value={focusArea} onChange={(event) => setFocusArea(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5"><option> Punctuality </option><option>Lab Guidance</option><option>Teaching Clarity</option><option>Assessment Feedback</option></select></label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Current term<input value={term} onChange={(event) => setTerm(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Target goal<textarea required rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Example: Return assignment feedback within one week." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
        <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={isSaving || !goal.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Goal'}</button></div>
      </form>
    </div>
  );
};

export const PendingStudentsModal = ({ open, students = [], isLoading = false, onClose, onSendReminder, isSending = false }) => {
  if (!open) return null;

  const pendingItems = Array.isArray(students) ? students : [];

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pending-students-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="pending-students-title" className="text-xl font-bold text-slate-900">Pending Evaluations</h2>
            <p className="mt-1 text-sm text-slate-500">Students and peer evaluators waiting for overdue submissions.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700" aria-label="Close">&times;</button>
        </div>
        <div className="mt-5 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
          {isLoading ? <p className="p-6 text-center text-sm text-slate-500">Loading pending evaluations...</p> : pendingItems.length ? <ul className="divide-y divide-slate-100">{pendingItems.map((student, index) => {
            const isPeer = String(student.type || '').toLowerCase() === 'peer';
            return (
              <li key={`${student.evaluator_id || student.id || 'student'}-${student.dispatch_id || student.course_id || student.course_name || 'evaluation'}-${index}`} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-slate-800">{student.name || student.full_name || student.email || 'Student'}</p>
                  <p className="text-xs text-slate-500">{student.type === 'peer' ? `Peer evaluation for ${student.target_name || 'assigned target'}` : (student.course_name || student.instructor_name || student.item_type || 'Pending evaluation')}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPeer ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>{isPeer ? 'Peer' : 'Pending'}</span>
              </li>
            );
          })}</ul> : <p className="p-6 text-center text-sm text-slate-500">No pending students or peers found.</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
          <button type="button" onClick={onSendReminder} disabled={isSending || !pendingItems.length} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSending ? 'Sending...' : 'Send Reminder'}</button>
        </div>
      </div>
    </div>
  );
};

export const AnomaliesModal = ({ open, anomalies = [], onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="evaluation-anomalies-title">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="evaluation-anomalies-title" className="text-xl font-bold text-slate-900">Evaluation Score Anomalies</h2><p className="mt-1 text-sm text-slate-500">Submitted evaluations where all rubric scores are identical.</p></div><button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700" aria-label="Close">&times;</button></div>
        <div className="mt-5 max-h-96 overflow-y-auto rounded-xl border border-slate-200">{anomalies.length ? <ul className="divide-y divide-slate-100">{anomalies.map((anomaly, index) => <li key={anomaly.id || anomaly.dispatchId || index} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-slate-800">{anomaly.studentName || 'Student'} <span className="font-normal text-slate-500">evaluated</span> {anomaly.instructorName || 'Instructor'}</p><p className="mt-1 text-xs text-slate-500">{anomaly.courseName || 'Assigned course'} · {anomaly.reason}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Score {Number(anomaly.score || 0).toFixed(1)}</span></li>)}</ul> : <p className="p-6 text-center text-sm text-slate-500">No score anomalies were found.</p>}</div>
        <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button></div>
      </div>
    </div>
  );
};
