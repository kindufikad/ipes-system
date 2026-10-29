import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { FaStar } from 'react-icons/fa';
import { deanApi, criteriaApi } from '../services/api';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';
import LanguageToggle from './LanguageToggle';
import { LIKERT_OPTIONS, calculateLikertPercentage, hasLikertResponse } from '../utils/likertScoring';
import { deadlineToneClasses, getDeadlineState } from '../utils/evaluationDeadline';
import { validatePeerEvaluationFeedbackPair } from '../utils/validationUtility';

const DeanPeerEvaluationPanel = () => {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [criteria, setCriteria] = useState([]);
  const [language, setLanguage] = useState('en');
  
  const [formData, setFormData] = useState({ scores: {}, strengths: '', suggestions: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [detailsInstructor, setDetailsInstructor] = useState(null);

  const loadInstructors = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await deanApi.getPeerEvaluations();
      setInstructors((Array.isArray(data) ? data : [])
        .filter((instructor) => ['instructor', 'peer_instructor'].includes(String(instructor.role || instructor.target_role || '').toLowerCase()))
        .map((instructor) => ({
          ...instructor,
          isEvaluated: Boolean(instructor.isEvaluated)
            || ['submitted', 'completed', 'approved'].includes(String(instructor.status || instructor.submission_status || '').toLowerCase()),
        })));
    } catch (loadError) {
      setInstructors([]);
      setError(loadError?.message || 'Unable to load peer evaluations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstructors();
  }, []);

  useEffect(() => {
    if (!showModal) return;
    criteriaApi.get('peer')
      .then((rows) => setCriteria(Array.isArray(rows) ? rows : []))
      .catch(() => setCriteria([]));
  }, [showModal]);

  const handleOpenEvaluation = (instructor, mode = 'create') => {
    setSelectedInstructor(instructor);
    setModalMode(mode);
    if (mode === 'edit' && instructor.isEvaluated) {
      const responses = typeof instructor.responses === 'string' ? (() => {
        try { return JSON.parse(instructor.responses); } catch { return {}; }
      })() : (instructor.responses || {});
      setFormData({
        scores: responses,
        strengths: instructor.strengths || '',
        suggestions: instructor.suggestions || '',
      });
    } else {
      setFormData({ scores: {}, strengths: '', suggestions: '' });
    }
    setFormError('');
    setShowModal(true);
  };

  const handleSubmitEvaluation = async (event) => {
    event.preventDefault();
    if (!selectedInstructor) return;

    const criteriaIds = groupCriteriaByCategory(criteria).flatMap(g => g.criteria.map(c => c.id));
    if (criteriaIds.some((id) => !hasLikertResponse(formData.scores[id]))) {
      setFormError('Please rate every criterion before submitting.');
      return;
    }

    const feedbackValidation = validatePeerEvaluationFeedbackPair(formData.strengths, formData.suggestions);
    if (!feedbackValidation.valid) {
      setFormError(feedbackValidation.errors[0]);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const totalScore = Number(calculateLikertPercentage(formData.scores).toFixed(2));

      const payload = {
        instructorId: selectedInstructor.instructorId,
        responses: formData.scores,
        strengths: formData.strengths,
        suggestions: formData.suggestions,
        score: totalScore,
      };

      if (modalMode === 'edit' && selectedInstructor.isEvaluated) {
        await deanApi.updatePeerEvaluation(selectedInstructor.evaluation_id, payload);
      } else {
        await deanApi.submitPeerEvaluation(payload);
      }

      setMessage('Peer evaluation submitted successfully.');
      setShowModal(false);
      await loadInstructors();
    } catch (submitError) {
      setFormError(submitError?.message || 'Unable to submit peer evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetails = (instructor) => {
    setDetailsInstructor(instructor);
  };

  const labels = {
    en: {
      title: 'Peer Evaluation',
      description: 'Evaluate your colleagues on collaboration and professional performance.',
      noPending: 'No pending peer evaluations.',
      instructor: 'Instructor',
      department: 'Department',
      deadline: 'Deadline',
      action: 'Action',
      evaluate: 'Evaluate',
      evaluated: 'Evaluated',
      completed: 'Completed',
      viewDetails: 'View Details',
      editUpdate: 'Edit/Update',
      loading: 'Loading peer evaluations...',
      error: 'Unable to load peer evaluations.',
      formTitle: 'Peer Evaluation Form',
      strengths: 'Strengths',
      strengthsPlaceholder: 'Describe strengths and positive contributions...',
      suggestions: 'Suggestions for Improvement',
      suggestionsPlaceholder: 'Provide constructive suggestions for growth...',
      submit: 'Submit Evaluation',
      update: 'Update Evaluation',
      submitting: 'Submitting...',
      cancel: 'Cancel',
      rateAll: 'Please rate every criterion before submitting.',
      score: 'Score',
      viewDetailsTitle: 'Submitted Evaluation',
    },
    am: {
      title: 'የባልደረባ ግምገማ',
      description: 'በትብብር እና በሙያዊ አፈፃፀም ላይ የወርካ ባልደረባዎን ይገምግሙ።',
      noPending: 'ምንም ያልተጠናቀቁ የባልደረባ ግምገማዎች የሉም።',
      instructor: 'መምህር',
      department: 'ዲፓርትመንት',
      deadline: 'መቋጮ ቀን',
      action: 'ድርጊት',
      evaluate: 'ይገምግሙ',
      evaluated: 'ተገምግሟል',
      completed: 'ተጠናቋል',
      viewDetails: 'ዝርዝር ይመልከቱ',
      editUpdate: 'ያርትዑ/ያስቀምጡ',
      loading: 'የባልደረባ ግምገማ በመጫን ላይ...',
      error: 'የባልደረባ ግምገማ ሊጫን አልቻለም።',
      formTitle: 'የባልደረባ ግምገማ ቅጽ',
      strengths: 'ጥንካሬዎች',
      strengthsPlaceholder: 'ጥንካሬዎችን እና አዎንታዊ አስተዋጽዖዎችን ይግለጹ...',
      suggestions: 'ለማሻሻል የሚያስፈልጉ ሞከራዎች',
      suggestionsPlaceholder: 'ገንቢ የሆኑ ምክርት ይስጡ...',
      submit: 'ግምገማ ያስገቡ',
      update: 'ግምገማ ያስቀምጡ',
      submitting: 'በመግባት ላይ...',
      cancel: 'ሰርዝ',
      rateAll: 'ከመግባት በፊት ሁሉንም መስፈርትን ይገምግሙ።',
      score: 'ውጤት',
      viewDetailsTitle: 'ተገምግሞ የተላከ ግምገማ',
    },
  };

  const t = labels[language] || labels.en;
  const getCompletedScore = (instructor) => {
    const value = instructor.total_score ?? instructor.overall_score ?? instructor.score;
    const score = Number(value);
    return Number.isFinite(score) && score > 0 ? score : null;
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.description}</p>
        </div>
        <LanguageToggle language={language} onChange={setLanguage} />
      </div>

      {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t.instructor}</th>
              <th className="px-4 py-3">{t.department}</th>
              <th className="px-4 py-3">{t.deadline}</th>
              <th className="px-4 py-3">{t.action}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-4 py-8 text-center text-sm text-slate-500">{t.loading}</td>
              </tr>
            ) : instructors.length ? (
              instructors.map((instructor) => (
                <tr key={`${instructor.instructorId}-${instructor.evaluation_id || instructor.peer_evaluation_id || 'peer'}`} className="border-b border-slate-100">
                  <td className="px-4 py-4 font-medium text-slate-900">
                    {instructor.full_name || instructor.name || instructor.email}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{instructor.department || '-'}</td>
                  <td className="px-4 py-4 text-slate-600">{instructor.deadline || '-'}</td>
                  <td className="px-4 py-4">
                    {['submitted', 'completed', 'approved'].includes(String(instructor.status || instructor.submission_status || '').toLowerCase()) ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> {t.completed}{getCompletedScore(instructor) !== null ? ` (${getCompletedScore(instructor).toFixed(0)}/100)` : ''}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(instructor)}
                            className="block text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
                          >
                            {t.viewDetails}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEvaluation(instructor, 'edit')}
                            className="block text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
                          >
                            {t.editUpdate}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenEvaluation(instructor, 'create')}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        <FaStar className="h-3 w-3" /> {t.evaluate}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="px-4 py-8 text-center text-sm text-slate-500">{t.noPending}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedInstructor && (
        <PeerEvaluationFormModal
          instructor={selectedInstructor}
          mode={modalMode}
          criteria={criteria}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmitEvaluation}
          onClose={() => setShowModal(false)}
          submitting={submitting}
          error={formError}
          language={language}
          setLanguage={setLanguage}
          labels={labels}
        />
      )}

      {detailsInstructor && (
        <EvaluationDetailsModal
          instructor={detailsInstructor}
          onClose={() => setDetailsInstructor(null)}
          language={language}
          labels={labels}
        />
      )}
    </section>
  );
};

const PeerEvaluationFormModal = ({
  instructor,
  mode,
  criteria,
  formData,
  setFormData,
  onSubmit,
  onClose,
  submitting,
  error,
  language,
  setLanguage,
  labels,
}) => {
  const t = labels[language] || labels.en;
  const criteriaSections = groupCriteriaByCategory(criteria);
  const deadlineState = getDeadlineState(instructor.deadline);
  const deadlineText = deadlineState.date
    ? deadlineState.label.replace(/^Deadline:\s*/, '')
    : instructor.deadline || 'Not specified';
  const staffName = instructor.name || instructor.full_name || instructor.email || 'Evaluated Staff';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Mekdela Amba University</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{t.formTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">Evaluate professional performance using the shared 1-5 scale.</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle language={language} onChange={setLanguage} />
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="border-b border-slate-200 bg-white px-6 pb-5">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            <span className="font-bold">Scale:</span> 1 = Very Low (VL), 2 = Low (L), 3 = Average (A), 4 = High (H), 5 = Very High (VH), NA = Not Applicable
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:col-span-2"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Staff Name (Evaluated Staff)</p><p className="mt-1 font-semibold text-slate-900">{staffName}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Deadline</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${deadlineToneClasses[deadlineState.tone]}`}>{deadlineText}</span></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Department & College</p><p className="mt-1 font-semibold text-slate-900">{instructor.department || 'Not assigned'}</p><p className="text-xs text-slate-500">{instructor.college_name || 'Mekdela Amba University'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Academic Year</p><p className="mt-1 font-semibold text-slate-900">{instructor.academic_year || new Date().getFullYear()}</p><p className="text-xs text-slate-500">Semester {instructor.semester || 'I'}</p></div>
          </div>
        </div>

        {error && <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {criteriaSections.map((section) => {
              let questionNumber = 1;
              return (
                <fieldset key={section.category} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <legend className="px-2 text-sm font-bold text-slate-900">{section.category}</legend>
                  <div className="mt-2 space-y-3">
                    {section.criteria.map((criterion) => {
                      const questionNumberValue = questionNumber++;
                      return (
                        <div key={criterion.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="flex-1 text-sm font-medium text-slate-800"><span className="mr-2 font-mono text-xs text-slate-400">{questionNumberValue}.</span>{getQuestionText(criterion, language)}</p>
                          <div className="flex shrink-0 flex-wrap gap-2" role="radiogroup" aria-label={`Rating for ${getQuestionText(criterion, language)}`}>
                            {LIKERT_OPTIONS.map((rating) => (
                              <button
                                key={rating}
                                type="button"
                                onClick={() => setFormData((current) => ({ ...current, scores: { ...current.scores, [criterion.id]: rating } }))}
                                aria-pressed={formData.scores[criterion.id] === rating}
                                  className={`h-9 ${rating === 'NA' ? 'w-12' : 'w-9'} rounded-full text-sm font-bold transition ${
                                  formData.scores[criterion.id] === rating
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                              }`}
                              >
                                {rating}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
            <div className="grid gap-4 md:grid-cols-2">

          <label className="block text-sm font-medium text-slate-700">
            {t.strengths}
            <textarea
              value={formData.strengths}
              onChange={(e) => setFormData((current) => ({ ...current, strengths: e.target.value }))}
              rows={3}
              placeholder={t.strengthsPlaceholder}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t.suggestions}
            <textarea
              value={formData.suggestions}
              onChange={(e) => setFormData((current) => ({ ...current, suggestions: e.target.value }))}
              rows={3}
              placeholder={t.suggestionsPlaceholder}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
            </div>
          </div>

          <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? t.submitting : mode === 'edit' ? t.update : t.submit}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

const EvaluationDetailsModal = ({ instructor, onClose, language, labels }) => {
  const t = labels[language] || labels.en;
  const responses = typeof instructor.responses === 'string' ? (() => {
    try { return JSON.parse(instructor.responses); } catch { return {}; }
  })() : (instructor.responses || {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t.viewDetailsTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{instructor.name || instructor.full_name || instructor.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {Object.entries(responses).length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700">Ratings</h3>
              {Object.entries(responses).map(([criterionId, score]) => (
                <div key={criterionId} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
                  <span className="text-sm text-slate-700">{criterionId}</span>
                  <strong className="text-blue-700">{score}/5</strong>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">{labels.en.strengths}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{instructor.strengths || 'No feedback provided.'}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">{labels.en.suggestions}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{instructor.suggestions || 'No feedback provided.'}</p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 text-right text-sm font-bold text-emerald-700">
            {t.score}: {Number(instructor.score || 0).toFixed(0)}/100
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
          >
            {labels.en.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeanPeerEvaluationPanel;
