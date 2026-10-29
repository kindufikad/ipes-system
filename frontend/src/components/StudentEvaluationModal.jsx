import { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { Clock3 } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import AIInsightsWidget from './ai/AIInsightsWidget';
import { evaluationApi } from '../services/api';
import { validateEvaluationFeedbackPair, VALIDATION_MESSAGE } from '../utils/validationUtility';
import { deadlineToneClasses, getDeadlineState } from '../utils/evaluationDeadline';
import { calculateLikertPercentage, hasLikertResponse } from '../utils/likertScoring';

const analyzeFeedback = (strengths, improvements) => {
  const feedback = `${strengths} ${improvements}`.trim();
  const words = feedback ? feedback.split(/\s+/).filter(Boolean).length : 0;
  const sentences = feedback ? feedback.split(/[.!?]+/).filter(Boolean).length : 0;
  const hasSpecificDetail = /\b(lecture|example|assignment|exercise|explanation|laboratory|lab|course|chapter|question|feedback|class)\b/i.test(feedback);
  const hasConstructiveLanguage = /\b(could|would|suggest|recommend|improve|helpful|clear|effective|appreciate|consider)\b/i.test(feedback);
  const hasGenericPraise = /\b(good|great|nice|best|excellent|amazing)\b/i.test(feedback) && words < 12;
  const hasHarshLanguage = /\b(stupid|lazy|worst|bad teacher|hate)\b/i.test(feedback);
  const isDetailed = words >= 18 || (sentences >= 2 && hasSpecificDetail);
  const positive = feedback ? (hasConstructiveLanguage || hasSpecificDetail ? 68 : 48) : 0;
  const negative = hasHarshLanguage ? 32 : feedback ? (hasGenericPraise ? 8 : 4) : 0;
  const neutral = feedback ? Math.max(0, 100 - positive - negative) : 0;
  const tips = [];

  if (!feedback) tips.push('Add a specific classroom observation to make your feedback useful.');
  if (!hasSpecificDetail && feedback) tips.push('Be specific about lecture examples, assignments, or course activities.');
  if (hasGenericPraise) tips.push('Avoid overly generic praise by explaining what worked well.');
  if (improvements.trim() && !hasConstructiveLanguage) tips.push('Frame improvement points as respectful, actionable suggestions.');

  return {
    tone: hasHarshLanguage || (!isDetailed && Boolean(feedback)) ? 'Needs More Detail' : 'Constructive & Respectful',
    toneClass: hasHarshLanguage || (!isDetailed && Boolean(feedback)) ? 'border-amber-300/40 bg-amber-300/15 text-amber-100' : 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100',
    summary: tips.length ? tips : ['Your feedback includes useful detail and constructive wording.'],
    sentiment: { positive, neutral, negative },
    recommendations: [
      { title: 'Strengthen your feedback', description: 'Add one observable example so the instructor can act on your comment.', actionLabel: 'Insert Template', actionType: 'INSERT_TEMPLATE', target: 'strengths' },
      { title: 'Balance the tone', description: 'Keep improvement suggestions focused on teaching practices and learner outcomes.', actionLabel: 'Insert Suggestion', actionType: 'INSERT_TEMPLATE', target: 'improvements' },
    ],
  };
};

export default function StudentEvaluationModal({
  open,
  onClose,
  course = {},
  dispatchItem = null,
  sections = [],
  onSubmit,
  isSubmitting = false,
  successMessage = '',
  errorMessage = '',
  mode = 'create',
  evaluationRecord = null,
}) {
  const [responses, setResponses] = useState({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isEditMode, setIsEditMode] = useState(mode === 'edit');
  const [language, setLanguage] = useState('en');
  const [activeDeadline, setActiveDeadline] = useState('');

  useEffect(() => {
    if (!open) return;

    const nextResponses = (() => {
      if (!evaluationRecord) return {};
      if (typeof evaluationRecord.responses === 'string') {
        try {
          return JSON.parse(evaluationRecord.responses);
        } catch {
          return {};
        }
      }
      return evaluationRecord.responses || {};
    })();

    setResponses(nextResponses);
    setStrengths(evaluationRecord?.strengths || '');
    setImprovements(evaluationRecord?.improvements || '');
    setSubmitError('');
    setSubmitSuccess('');
    setIsEditMode(mode === 'edit');
    setActiveDeadline(dispatchItem?.deadline || course?.deadline || '');
    evaluationApi.getActiveEvaluationDeadline().then((result) => {
      if (result?.deadlineAt) setActiveDeadline(result.deadlineAt);
    }).catch(() => {});
  }, [open, evaluationRecord, mode]);

  useEffect(() => {
    setSubmitError(errorMessage || '');
  }, [errorMessage]);

  useEffect(() => {
    setSubmitSuccess(successMessage || '');
  }, [successMessage]);

  const isReadOnly = mode === 'view' && !isEditMode;
  const deadlineState = useMemo(() => getDeadlineState(activeDeadline || dispatchItem?.deadline || course?.deadline), [activeDeadline, course?.deadline, dispatchItem?.deadline]);
  const deadlineLocked = deadlineState.expired && !isReadOnly;
  const feedbackValidation = useMemo(() => validateEvaluationFeedbackPair(strengths, improvements), [strengths, improvements]);
  const feedbackAnalysis = useMemo(() => analyzeFeedback(strengths, improvements), [strengths, improvements]);
  const totalScore = useMemo(() => calculateLikertPercentage(responses), [responses]);
  let globalQuestionNumber = 1;

  const setAnswer = (id, value) => setResponses((prev) => ({ ...prev, [id]: value }));

  const handleEditClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsEditMode(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!dispatchItem || !dispatchItem.id) {
      setSubmitError('No pending evaluation dispatch found for this course. Please contact your administrator.');
      return;
    }
    if (deadlineLocked) {
      setSubmitError('Deadline Passed - Contact Dept Head');
      return;
    }

    // Validate that all criteria have been answered
    const allItemIds = sections.reduce((acc, section) => acc.concat((section.items || []).map(item => item.id)), []);
    const unansweredItems = allItemIds.filter((id) => !hasLikertResponse(responses[id]));
    
    if (unansweredItems.length > 0) {
      setSubmitError(`Please answer all criteria questions before submitting. ${unansweredItems.length} question(s) remaining.`);
      return;
    }

    if (!feedbackValidation.valid) {
      setSubmitError(feedbackValidation.errors[0] || VALIDATION_MESSAGE);
      return;
    }

    try {
      if (typeof onSubmit === 'function') {
        await onSubmit({
          dispatch_id: dispatchItem.id,
          assignment_id: dispatchItem.assignment_id || undefined,
          course_id: dispatchItem.course_id || course.assignment_id || course.course_id || undefined,
          score: Number(totalScore.toFixed(2)),
          strengths,
          improvements,
          responses,
        });
        setSubmitSuccess('Evaluation submitted successfully.');
      } else {
        setSubmitError('Submit handler is not available.');
      }
    } catch (error) {
      console.error('Student evaluation submission error:', error);
      setSubmitError(error?.message || 'Unable to submit evaluation.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Student Evaluation</h2>
            <p className="text-sm text-gray-500">Evaluate the instructor and course using the checklist below.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <FaTimes />
          </button>
          <LanguageToggle language={language} onChange={setLanguage} />
        </div>

        <div className="space-y-4 p-6 max-h-[calc(100vh-140px)] overflow-y-auto pr-2">
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Scale</p>
                <p className="text-sm text-gray-600">1 = Very Low, 2 = Low, 3 = Average, 4 = High, 5 = Very High, N/A = Not Applicable</p>
              </div>
              {mode === 'view' && !isEditMode && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700">View Mode</span>
              )}
            </div>
          </div>

            <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Course</p>
              <p className="mt-2 font-semibold text-gray-900">{course.course_code || course.code || 'N/A'}</p>
              <p className="text-sm text-gray-600">{course.course_name || course.name || 'Unknown Course'}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Instructor</p>
              <p className="mt-2 font-semibold text-gray-900">{course.instructor_name || course.instructor || 'N/A'}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${deadlineToneClasses[deadlineState.expired ? 'danger' : deadlineState.tone]}`}>{deadlineState.tone === 'warning' ? <Clock3 size={13} /> : null}{deadlineState.expired ? 'Evaluation deadline has passed.' : deadlineState.label}</span>
            </div>
          </div>

          {deadlineLocked ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Evaluation deadline has passed. Submissions are closed.</div> : null}

          {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{submitError}</div> : null}
          {submitSuccess ? <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{submitSuccess}</div> : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            {sections.map((section) => (
              <div key={section.title} className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
                <div className="mt-4 space-y-3">
                  {(section.items || []).map((item) => {
                    const questionNumberValue = globalQuestionNumber++;
                    return (
                      <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex-1 pr-4 text-sm font-medium text-gray-700">
                          <span className="mr-3 font-mono text-gray-400">{questionNumberValue}.</span>
                          {language === 'am' ? (item.am || item.labelAm || item.textAm || item.en || item.label || item.text) : (item.en || item.label || item.text)}
                        </p>

                        <div className="flex items-center gap-2 shrink-0">
                          {[1, 2, 3, 4, 5, 'N/A'].map((value) => {
                            const selected = responses[item.id] === value;
                            const isNotApplicableOption = value === 'N/A';
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => !isReadOnly && setAnswer(item.id, value)}
                                disabled={isReadOnly || deadlineLocked}
                                className={`flex h-9 items-center justify-center rounded-full px-2 text-sm font-semibold transition-all duration-150 ${
                                  selected
                                    ? isNotApplicableOption
                                      ? 'scale-105 bg-slate-700 text-white shadow-md shadow-slate-200 ring-2 ring-slate-400'
                                      : 'scale-105 bg-blue-600 text-white shadow-md shadow-blue-200 ring-2 ring-blue-300'
                                    : isNotApplicableOption
                                      ? 'border border-slate-300 bg-slate-100 text-slate-600 hover:border-slate-500 hover:text-slate-800'
                                      : 'w-9 border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
                                } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                              >
                                {value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Overall score</p>
                  <p className="text-xs text-gray-500">Calculated from selected ratings</p>
                </div>
                <div className="rounded-full bg-ieps-blue-50 px-4 py-2 text-sm font-semibold text-ieps-blue-700">{totalScore.toFixed(1)} / 100</div>
              </div>
            </div>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block font-medium">Strengths of the Instructor (የመምህሩ ጠንካራ ጎኖች)</span>
              <textarea
                rows={4}
                name="strengths"
                value={strengths}
                onChange={(event) => setStrengths(event.target.value)}
                disabled={isReadOnly || deadlineLocked}
                className="w-full rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 disabled:cursor-default disabled:bg-gray-50"
                placeholder="Describe the instructor's strengths."
                aria-invalid={!isReadOnly && !feedbackValidation.strengths.valid}
              />
              {!isReadOnly && !feedbackValidation.strengths.valid ? <p className="mt-2 text-sm font-medium text-red-600">{VALIDATION_MESSAGE}</p> : null}
            </label>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block font-medium">Suggested points/aspects the instructor should improve (መምህሩ ሊያሻሽላቸው የሚገቡ ነጥቦች)</span>
              <textarea
                rows={4}
                name="improvements"
                value={improvements}
                onChange={(event) => setImprovements(event.target.value)}
                disabled={isReadOnly || deadlineLocked}
                className="w-full rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 disabled:cursor-default disabled:bg-gray-50"
                placeholder="Suggest areas for improvement."
                aria-invalid={!isReadOnly && !feedbackValidation.improvements.valid}
              />
              {!isReadOnly && !feedbackValidation.improvements.valid ? <p className="mt-2 text-sm font-medium text-red-600">{VALIDATION_MESSAGE}</p> : null}
            </label>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">Feedback quality</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${feedbackValidation.quality === 'Good' ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-700' : 'border-amber-300/40 bg-amber-300/15 text-amber-700'}`}>
                Feedback Quality: {feedbackValidation.quality}
              </span>
            </div>
            {!isReadOnly && feedbackValidation.errors.length > 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{feedbackValidation.errors[0]}</p> : null}

            <AIInsightsWidget
              role="STUDENT"
              data={{
                summary: feedbackAnalysis.summary,
                sentiment: feedbackAnalysis.sentiment,
                recommendations: feedbackAnalysis.recommendations,
              }}
              isEnabled={!isReadOnly && !deadlineLocked}
              onActionClick={(actionType, payload) => {
                if (actionType !== 'INSERT_TEMPLATE') return;
                const template = payload.target === 'strengths'
                  ? 'The instructor explains concepts clearly and connects lessons to practical examples.'
                  : 'Could provide more timely feedback on assignments and allow additional time for questions.';
                if (payload.target === 'strengths') setStrengths((current) => current ? `${current} ${template}` : template);
                else setImprovements((current) => current ? `${current} ${template}` : template);
              }}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={onClose} className="rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {mode === 'view' && !isEditMode ? 'Close' : 'Cancel'}
              </button>

              {mode === 'view' && !isEditMode ? (
                <button type="button" onClick={handleEditClick} className="rounded-full bg-gray-700 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800">
                  Edit Evaluation
                </button>
              ) : (
                <button type="submit" disabled={isSubmitting || isReadOnly || deadlineLocked || !feedbackValidation.valid} className="rounded-full bg-ieps-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ieps-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? 'Submitting...' : mode === 'view' ? 'Update Evaluation' : 'Submit Evaluation'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
