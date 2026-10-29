import { useEffect, useMemo, useState } from 'react';
import LanguageToggle from './LanguageToggle';
import { criteriaApi } from '../services/api';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';
import { calculateLikertPercentage, hasLikertResponse } from '../utils/likertScoring';

export default function StudentEvaluationForm({ dispatchItem, onSaveDraft = () => {}, onSubmit }) {
  const [criteria, setCriteria] = useState([]);
  const [responses, setResponses] = useState({});
  const [feedback, setFeedback] = useState('');
  const [language, setLanguage] = useState('en');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    criteriaApi.get('student').then((rows) => setCriteria(Array.isArray(rows) ? rows : [])).catch(() => setCriteria([]));
  }, []);

  const sections = useMemo(() => groupCriteriaByCategory(criteria), [criteria]);

  const totalScore = useMemo(() => calculateLikertPercentage(responses), [responses]);

  const setAnswer = (id, value) => setResponses((p) => ({ ...p, [id]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const unansweredItems = sections
      .flatMap((section) => section.criteria || [])
      .filter((item) => !hasLikertResponse(responses[item.id]));
    if (unansweredItems.length) {
      setSubmitError(`Please answer all criteria questions before submitting. ${unansweredItems.length} question(s) remaining.`);
      return;
    }
    setSubmitError('');
    const payload = {
      dispatch_id: dispatchItem?.id,
      score: Number(totalScore.toFixed(2)),
      feedback,
      responses,
    };
    onSubmit(payload);
  };

  return (
    <div>
      {dispatchItem && (
        <div className="mb-4 rounded-3xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">አዲስ ቅፅ ደርሶዎታል (New form received)</p>
              <p className="text-xs text-green-600 mt-1">Department head sent an evaluation form. Please complete all sections below and submit.</p>
            </div>
            <span className="text-xs font-semibold bg-green-200 text-green-800 px-2 py-1 rounded-full">Pending</span>
            <LanguageToggle language={language} onChange={setLanguage} />
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ieps-blue-600">Student Evaluation Form</h2>
          <p className="text-sm text-gray-500">Evaluating {dispatchItem?.payload?.instructor || dispatchItem?.payload?.instructorName || 'Instructor'} · {dispatchItem?.course_code || dispatchItem?.payload?.course}</p>
        </div>
        <div className="rounded-full bg-ieps-blue-50 px-3 py-2 text-sm font-semibold text-ieps-blue-700">Estimated Score: {totalScore.toFixed(1)} / 100</div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {sections.map((section) => (
          <div key={section.category} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-800">{section.category}</h3>
            <div className="mt-3 space-y-3">
              {(section.criteria || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-gray-700">{getQuestionText(item, language)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 'N/A'].map((v) => (
                        <label key={v} className={`rounded-full border px-3 py-1 text-sm ${responses[item.id] === v ? (v === 'N/A' ? 'border-slate-700 bg-slate-700 text-white' : 'border-ieps-blue-600 bg-ieps-blue-600 text-white') : (v === 'N/A' ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-gray-200 bg-white text-gray-700')}`}>
                          <input type="radio" name={item.id} value={v} checked={responses[item.id] === v} onChange={() => setAnswer(item.id, v)} className="sr-only" />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

        <label className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Additional feedback</span>
          <textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2" />
        </label>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onSaveDraft({ responses, feedback })} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">Save Draft</button>
          <button type="submit" className="rounded-full bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white">Submit Evaluation</button>
        </div>
      </form>
    </div>
  );
}
