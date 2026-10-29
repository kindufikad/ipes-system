import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { FaStar } from 'react-icons/fa';
import { criteriaApi, deanApi } from '../services/api';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';

const competencyGroups = [
  {
    title: 'CORE COMPETENCY: LEADERSHIP & MANAGEMENT',
    criteria: [
      { id: 'leadership', label: 'Provides professional leadership and support for instructors.' },
      { id: 'planning', label: 'Maintains timely academic planning and reporting.' },
    ],
  },
  {
    title: 'CORE COMPETENCY: COMMUNICATION & QUALITY ASSURANCE',
    criteria: [
      { id: 'communication', label: 'Communicates effectively with faculty and students.' },
      { id: 'quality', label: 'Promotes quality assurance and continuous improvement.' },
      { id: 'accountability', label: 'Demonstrates fair and accountable departmental administration.' },
    ],
  },
];

const EvaluateDeptHeads = ({ mode = 'dept-heads' }) => {
  const [deptHeads, setDeptHeads] = useState([]);
  const [selectedHead, setSelectedHead] = useState(null);
  const [scores, setScores] = useState({});
  const [formData, setFormData] = useState({ strengths: '', weaknesses: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detailsHead, setDetailsHead] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const title = mode === 'peer' ? 'Peer Evaluation' : 'Evaluate Department Heads';
  const configuredCriteria = criteria.length
    ? groupCriteriaByCategory(criteria).map((group) => ({
      title: group.category,
      criteria: group.criteria.map((criterion) => ({ ...criterion, label: getQuestionText(criterion, 'en') })),
    }))
    : competencyGroups;
  const allCriteria = configuredCriteria.flatMap((group) => group.criteria);

  const loadDepartmentHeads = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await deanApi.getEvaluations();
      setDeptHeads(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setDeptHeads([]);
      setError(loadError?.message || 'Unable to load pending Department Head evaluations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDepartmentHeads(); }, []);

  useEffect(() => {
    criteriaApi.get(mode === 'peer' ? 'peer' : 'dept_head')
      .then((rows) => setCriteria(Array.isArray(rows) ? rows : []))
      .catch(() => setCriteria([]));
  }, [mode]);

  const openEvaluation = (head) => {
    setSelectedHead(head);
    setScores({});
    setFormData({ strengths: '', weaknesses: '' });
    setError('');
    setMessage('');
  };

  const submitEvaluation = async (event) => {
    event.preventDefault();
    if (allCriteria.some((criterion) => !scores[criterion.id])) {
      setError('Please rate every criterion before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const numericScores = allCriteria.map((criterion) => Number(scores[criterion.id]));
      const totalScore = (numericScores.reduce((sum, score) => sum + score, 0) / (allCriteria.length * 5)) * 100;
      await deanApi.submitDepartmentHeadEvaluation({
        instructorId: selectedHead.instructorId,
        criteriaScores: scores,
        totalScore,
        strengths: formData.strengths,
        weaknesses: formData.weaknesses,
      });
      setMessage('Department Head evaluation submitted successfully.');
      setSelectedHead(null);
      await loadDepartmentHeads();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit Department Head evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (selectedHead) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Department Head Evaluation</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{selectedHead.full_name || selectedHead.name || selectedHead.email}</h2>
            <p className="mt-1 text-sm text-slate-500">{selectedHead.department_name || selectedHead.department || 'Department'}</p>
          </div>
          <button type="button" onClick={() => setSelectedHead(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Back to list</button>
        </div>

        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Instructions:</strong> Please evaluate the Department Head on all criteria using the 5-point scale (1=Poor to 5=Excellent). Each criterion contributes equally to the final evaluation score.
        </div>

        {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <form onSubmit={submitEvaluation} className="space-y-7">
          {configuredCriteria.map((group) => (
            <fieldset key={group.title} className="space-y-4">
              <legend className="border-b border-slate-200 pb-2 text-xs font-bold tracking-[0.14em] text-slate-500">{group.title}</legend>
              {group.criteria.map((criterion) => (
                <div key={criterion.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-800">{criterion.label}</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Rating for ${criterion.label}`}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setScores((current) => ({ ...current, [criterion.id]: rating }))}
                        aria-pressed={scores[criterion.id] === rating}
                        className={`h-10 w-10 rounded-full text-sm font-bold transition ${scores[criterion.id] === rating ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          ))}
          <label className="block text-sm font-medium text-slate-700">Strengths / Key Achievements
            <textarea value={formData.strengths} onChange={(event) => setFormData((current) => ({ ...current, strengths: event.target.value }))} rows={4} placeholder="Enter positive performance observations..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Areas for Improvement / Growth Opportunities
            <textarea value={formData.weaknesses} onChange={(event) => setFormData((current) => ({ ...current, weaknesses: event.target.value }))} rows={4} placeholder="Enter constructive feedback..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </label>
          <button type="submit" disabled={submitting} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? 'Submitting...' : 'Submit Evaluation'}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6"><h2 className="text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">Select an evaluation to open the criteria or review a submitted evaluation.</p></div>
      {message ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading pending evaluations...</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Department Head / Instructor</th><th className="px-4 py-3">Deadline</th><th className="px-4 py-3">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {deptHeads.length ? deptHeads.map((head) => {
                const evaluated = Boolean(head.isEvaluated);
                return <tr key={head.id || head.dept_head_id || head.instructorId}><td className="px-4 py-4 font-medium text-slate-900">{head.full_name || head.name || head.email}<span className="block text-xs font-normal text-slate-500">{head.department_name || head.department || 'Department'}</span></td><td className="px-4 py-4 text-slate-600">{head.deadline || '-'}</td><td className="px-4 py-4">{evaluated ? <div className="space-y-1"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Evaluated ({Number(head.score || 0).toFixed(0)}/100)</span><button type="button" onClick={() => setDetailsHead(head)} className="block text-xs font-semibold text-blue-700 underline-offset-2 hover:underline">View Details</button></div> : <button type="button" onClick={() => openEvaluation(head)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"><FaStar className="h-3 w-3" /> Evaluate</button>}</td></tr>;
              }) : <tr><td colSpan="3" className="px-4 py-8 text-center text-sm text-slate-500">No evaluations are available.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {detailsHead ? <EvaluationDetailsModal head={detailsHead} onClose={() => setDetailsHead(null)} /> : null}
    </section>
  );
};

const EvaluationDetailsModal = ({ head, onClose }) => {
  const criteriaScores = typeof head.criteriaScores === 'string' ? (() => { try { return JSON.parse(head.criteriaScores); } catch { return {}; } })() : (head.criteriaScores || {});
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="evaluation-details-title"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 id="evaluation-details-title" className="text-xl font-bold text-slate-900">Submitted Evaluation</h2><p className="mt-1 text-sm text-slate-500">{head.name || head.full_name || head.email}</p></div><button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-3">{Object.entries(criteriaScores).map(([criterionId, score]) => <div key={criterionId} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3"><span className="text-sm text-slate-700">{criterionId}</span><strong className="text-blue-700">{score}/5</strong></div>)}</div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div><h3 className="text-sm font-semibold text-slate-700">Strengths / Key Achievements</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{head.strengths || 'No feedback provided.'}</p></div><div><h3 className="text-sm font-semibold text-slate-700">Areas for Improvement</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{head.weaknesses || 'No feedback provided.'}</p></div></div><div className="mt-6 border-t border-slate-200 pt-4 text-right text-sm font-bold text-emerald-700">Total score: {Number(head.score || 0).toFixed(0)}/100</div></div></div>;
};

export default EvaluateDeptHeads;
