import React from 'react';
import { Clock3 } from 'lucide-react';
import { criteriaApi, evaluationApi } from '../services/api';
import LanguageToggle from './LanguageToggle';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';
import { formatEvaluationDeadline } from '../utils/formatEvaluationDeadline';

// Simple 1-5 rating scale
const RATING_SCALE = [1, 2, 3, 4, 5];

export default function InstructorEvaluationCriteriaModal({
  open,
  onClose,
  instructorName,
  criteriaScores = {},
  setCriteriaScores,
  onSubmit,
  isSubmitting = false,
  mode = 'edit',
  evaluatorType = 'dept_head',
  targetRole = 'instructor'
}) {
  const [error, setError] = React.useState('');
  const [isEditMode, setIsEditMode] = React.useState(mode === 'edit');
  const [criteria, setCriteria] = React.useState([]);
  const [language, setLanguage] = React.useState('en');
  const [loadingCriteria, setLoadingCriteria] = React.useState(false);
  const [activeDeadline, setActiveDeadline] = React.useState('');
  const [deadlineLoadError, setDeadlineLoadError] = React.useState('');
  const [currentTime, setCurrentTime] = React.useState(Date.now());

  React.useEffect(() => {
    if (!open) return;
    
    setLoadingCriteria(true);
    setError('');
    
    criteriaApi.get(evaluatorType, targetRole)
      .then((rows) => {
        const criteriaList = Array.isArray(rows) ? rows : [];
        setCriteria(criteriaList);
        if (criteriaList.length === 0) {
          setError(`No evaluation criteria available for ${targetRole === 'lab_assistant' ? 'lab assistants' : 'instructors'}.`);
        }
      })
      .catch((err) => {
        console.error(`Failed to load criteria for ${targetRole}:`, err);
        setError(`Unable to load evaluation criteria: ${err?.message || 'Unknown error'}`);
        setCriteria([]);
      })
      .finally(() => {
        setLoadingCriteria(false);
      });
  }, [evaluatorType, targetRole, open]);

  React.useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setActiveDeadline('');
    setDeadlineLoadError('');
    setCurrentTime(Date.now());
    evaluationApi.getActiveEvaluationDeadline()
      .then((result) => {
        if (!cancelled) setActiveDeadline(result?.deadlineAt || '');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load the active evaluation deadline:', err);
        setDeadlineLoadError('Unable to load the evaluation deadline.');
      });

    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  const parsedDeadline = activeDeadline ? new Date(activeDeadline) : null;
  const hasValidDeadline = parsedDeadline && !Number.isNaN(parsedDeadline.getTime());
  const deadlineExpired = Boolean(hasValidDeadline && parsedDeadline.getTime() <= currentTime);
  const formattedDeadline = hasValidDeadline
    ? formatEvaluationDeadline(activeDeadline, 'en-US')
    : 'Not specified';

  const handleScoreChange = (criteriaId, score) => {
    if (deadlineExpired) return;
    setCriteriaScores(prev => ({
      ...prev,
      [criteriaId]: score
    }));
    setError('');
  };

  const calculateAverageScore = () => {
    const scores = Object.values(criteriaScores);
    if (scores.length === 0) return 0;
    return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2);
  };

  const calculateTotalScore = () => {
    // Department Head evaluations contribute a maximum of 30 points.
    const avgScore = calculateAverageScore();
    return Number(((avgScore / 5) * 30).toFixed(2));
  };

  const allCriteriaScored = () => {
    return Object.keys(criteriaScores).length === criteria.length;
  };

  const handleSubmit = () => {
    if (deadlineExpired) {
      setError('The evaluation period for this cycle has ended.');
      return;
    }
    if (!allCriteriaScored()) {
      setError('Please score every criterion before submitting.');
      return;
    }
    const totalScore = calculateTotalScore();
    onSubmit(criteriaScores, totalScore);
  };

  const getRoleLabel = () => {
    if (targetRole === 'lab_assistant') return 'Lab Assistant';
    return 'Instructor';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/40">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl my-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditMode ? `${getRoleLabel()} Evaluation` : 'View Evaluation'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">{instructorName}</p>
            {!isEditMode && (
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                View Mode
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="text-2xl">✕</span>
          </button>
          <LanguageToggle language={language} onChange={setLanguage} />
        </div>

        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${deadlineExpired ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Deadline: {formattedDeadline}</span>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${deadlineExpired ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
            {deadlineExpired ? 'Expired' : 'Active'}
          </span>
        </div>
        {deadlineLoadError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{deadlineLoadError}</p> : null}
        {deadlineExpired ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">The evaluation period for this cycle has ended.</div> : null}

        {/* Instructions */}
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-900">
            {isEditMode ? (
              <>
                <strong>Instructions:</strong> Please evaluate the {targetRole === 'lab_assistant' ? 'lab assistant' : 'instructor'} on all {criteria.length} criteria using the 5-point scale (1=Poor to 5=Excellent). Each criterion contributes equally to the final evaluation score.
              </>
            ) : (
              <>
                <strong>View Mode:</strong> Below is the summary of the evaluation submitted for this {targetRole === 'lab_assistant' ? 'lab assistant' : 'instructor'}. Click "Edit Evaluation" to make changes.
              </>
            )}
          </p>
        </div>

        {/* Criteria Categories */}
        <div className="space-y-6 mb-6 max-h-96 overflow-y-auto pr-2">
          {loadingCriteria ? (
            <div className="py-8 text-center text-sm text-gray-500">
              <p>Loading evaluation criteria for {targetRole === 'lab_assistant' ? 'lab assistant' : 'instructor'}...</p>
            </div>
          ) : criteria.length === 0 ? (
            <div className="py-8 text-center text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p>No evaluation criteria available for this role.</p>
            </div>
          ) : (
            groupCriteriaByCategory(criteria).map((categoryObj) => (
              <div key={categoryObj.category}>
                {/* Category Header */}
                <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3 pl-1">
                  {categoryObj.category}
                </h3>

                {/* Criteria Items */}
                <div className="space-y-3">
                  {categoryObj.criteria.map((criterion, criterionIndex) => {
                    const currentScore = criteriaScores[criterion.id];
                    return (
                      <div
                        key={criterion.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/70 hover:bg-gray-100/50 rounded-2xl border border-gray-100 transition-all"
                      >
                        {/* Criterion Text */}
                        <p className="text-sm font-medium text-gray-700 flex-1 pr-4">
                          <span className="text-gray-400 mr-3 font-mono font-bold">{criterionIndex + 1}.</span>
                          {getQuestionText(criterion, language)}
                        </p>

                        {/* Circular Rating Buttons 1-5 */}
                        <div className="flex items-center gap-2 shrink-0">
                          {RATING_SCALE.map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => isEditMode && handleScoreChange(criterion.id, rating)}
                              disabled={!isEditMode || deadlineExpired}
                              className={`w-9 h-9 rounded-full text-sm font-semibold transition-all duration-150 flex items-center justify-center ${
                                currentScore === rating
                                  ? "bg-blue-600 text-white shadow-md shadow-blue-200 scale-105 ring-2 ring-blue-300"
                                  : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400 hover:text-blue-600"
                              } ${!isEditMode || deadlineExpired ? "cursor-default disabled:opacity-60" : "cursor-pointer"}`}
                            >
                              {rating}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Score Summary */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Criteria Scored</p>
            <p className="text-2xl font-bold text-ieps-blue-600">{Object.keys(criteriaScores).length}/{criteria.length}</p>
          </div>
          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Average (5-point scale)</p>
            <p className="text-2xl font-bold text-purple-600">{calculateAverageScore()}</p>
          </div>
          <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Final Score (0-100)</p>
            <p className="text-2xl font-bold text-green-600">{calculateTotalScore()} / 30</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-6 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isEditMode ? 'Cancel' : 'Close'}
          </button>
          {!isEditMode && (
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="px-6 py-2 rounded-lg bg-gray-600 text-white font-semibold hover:bg-gray-700 transition-colors"
            >
              Edit Evaluation
            </button>
          )}
          {isEditMode && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || deadlineExpired || !allCriteriaScored() || criteria.length === 0}
              className="px-6 py-2 rounded-lg bg-ieps-blue-600 text-white font-semibold hover:bg-ieps-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Evaluation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
