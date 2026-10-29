import { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { Clock3 } from 'lucide-react';
import { criteriaApi, evaluationApi } from '../services/api';
import LanguageToggle from './LanguageToggle';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';
import { deadlineToneClasses, getDeadlineState } from '../utils/evaluationDeadline';
import { LIKERT_OPTIONS, calculateLikertPercentage, hasLikertResponse } from '../utils/likertScoring';
import { validatePeerEvaluationFeedbackPair } from '../utils/validationUtility';

const araPeerCriteria = [
  { en: 'Continuous update of the subject matter', am: 'ርዕሱን በቅጡ መዘመን' },
  { en: 'Level of his/her subject matter knowledge and practical skill', am: 'ርዕሱን በሚመለከት ያለው እውቀት እና ተግባራዊ ክህሎት' },
  { en: 'Participation in seminars/workshop/research at department/college/university level during the year', am: 'በሰዓቱ በዲፓርትመንት/ኮሌጅ/ዩኒቨርሲቲ ደረጃ በሴሚናር/ወርክሾፕ/ምርምር ውስጥ ተሳትፎ' },
  { en: 'Guidance and counseling role to students during practical sessions', am: 'በተግባር ክፍለታቶች ለተማሪዎች መመሪያ እና ምክር ሚና' },
  { en: 'Assist faculty and students in the analysis of samples, maintenance, upkeep of instruments facilities, and general supervision', am: 'ለፋኩልቲ እና ተማሪዎች በናሙናዎች ትንታኔ፣ የመሳሪያዎች ጥገና እና አጠቃላይ ቁጥጥር ረገድ ዛቻ' },
  { en: 'Contributing ideas and activities that improve the teaching learning process', am: 'የመማር-ሕይወት ሥርዓትን ለማሻሻል ሀሳብ እና እንቅስቃሴ አስተዋጽኦ' },
  { en: 'Participation in problem identification and solving at department level', am: 'በዲፓርትመንት ደረጃ ችግር መለየት እና መፍታት ውስጥ ተሳትፎ' },
  { en: 'Willingness and preparedness to implement reform strategies', am: 'ማሻሻልን ለማስፈጸም ፍቅር እና ዝግጁነት' },
  { en: 'Willing to actively participate in education learning army/cooperative team work', am: 'በመማር ወታደር/ድርጅተ-ሥራ በስልታዊ ሁኔታ ለመሳተፍ ፍቅር' },
  { en: 'Implementation of different teaching methods in his discipline', am: 'በስርዓቱ ውስጥ የተለያዩ የመምህርነት ዘዴዎች ተግባር ማድረግ' },
  { en: 'Willingness to participate and level of commitment in committee works', am: 'በኮሚቴ ስራ ውስጥ ለመሳተፍ ፍቅር እና ቁርጠኝነት ደረጃ' },
  { en: 'Willingness to share university resources with other colleagues', am: 'ከሌሎች ባልደረባ ጋር ዩኒቨርሲቲ ሀብቶችን ለማጋራት ፍቅር' },
  { en: 'Showing cordiality to others and Team work spirit', am: 'ለሌሎች ደግነት ማሳየት እና ህብረት-ሥራ መንፈስ' },
  { en: 'Level of respect to rules, regulation and guidelines of the institution', am: 'ለተቋሙ ደንብ፣ ህግ እና መመሪያዎች ሙሉ ሞገስ' },
  { en: 'His/her discipline (dressing, personality etc...)', am: 'ሕጋዊ አቤሉ (ልብስ፣ ሥፈራ ወዘተ)' },
  { en: 'Willingness to help colleagues during laboratory work/workshop etc..', am: 'በላቦራቶሪ ሥራ/ወርክሾፕ ወዘተ ወቅት ባልደረቦች ለመርዳት ፍቅር' },
  { en: 'Report accident, unusual events, misbehavior, and failures of equipment due to mal operation/careless handling with the causing agents timely', am: 'አደጋ፣ ያልተለመደ ክስተቶች፣ ስህተተ-ሥርዓት እና የመሳሪያ ውድቅ ለመጣስ/ብዜት ወደ ፍጻሜውህ በተከታታይ ሪፖርት ማድረግ' },
  { en: 'Time utilization of class sessions (laboratory, workshop etc...)', am: 'የክፍል ክፍለታቶችን ጊዜ አጠቃቀም (ላቦራቶሪ፣ ወርክሾፕ ወዘተ)' },
  { en: 'Overall assessment of the academic and research assistant', am: 'የአካዳሚክ እና ምርምር አብራሪውን አጠቃላይ ግምገማ' },
];

const uiLabels = {
  en: {
    title: 'Peer Evaluation',
    description: 'To be completed by colleagues.',
    scale: 'Scale',
    scaleDescription: '1 = Very Low (VL), 2 = Low (L), 3 = Average (A), 4 = High (H), 5 = Very High (VH), NA = Not Applicable',
    araName: 'ARA Name (Evaluated Staff)',
    department: 'Department & College',
    academicYear: 'Academic Year',
    semester: 'Semester',
    araCriteria: 'ARA Criteria',
    overallScore: 'Overall score',
    calculatedFrom: 'Calculated from selected ratings',
    strengths: 'Strengths',
    strengthsPlaceholder: 'Describe strengths and positive contributions.',
    suggestions: 'Suggestions for improvement',
    suggestionsPlaceholder: 'Provide constructive suggestions for growth.',
    cancel: 'Cancel',
    close: 'Close',
    editEvaluation: 'Edit Evaluation',
    submitPeerEvaluation: 'Submit Peer Evaluation',
    updateEvaluation: 'Update Evaluation',
    submitting: 'Submitting...',
  },
  am: {
    title: 'ተመሳሳይ ግምገማ',
    description: 'በባልደረቦች ተሞልቷል።',
    scale: 'ልኬት',
    scaleDescription: '1 = በጣም ዝቅተኛ (VL), 2 = ዝቅተኛ (L), 3 = አማካይ (A), 4 = ከፍተኛ (H), 5 = በጣም ከፍተኛ (VH), NA = ተዛማጅ አይደለም',
    araName: 'ARA ስም (የገመቱ ሰራተኛ)',
    department: 'ዲፓርትመንት & ኮሌጅ',
    academicYear: '학년年',
    semester: 'ሴሚስተር',
    araCriteria: 'ARA መስፈርቶች',
    overallScore: 'አጠቃላይ ነጥብ',
    calculatedFrom: 'ከተመረጡ ደረጃዎች ተሰሉ',
    strengths: 'ጥንካሬዎች',
    strengthsPlaceholder: 'ጥንካሬዎች እና 긍정적ፍአንጋሚ አስተዋጽኦዎችን ይግለጹ።',
    suggestions: 'ለሻሚውንያ አመክንዮ',
    suggestionsPlaceholder: 'ለእድገት ትንቢት ሕብረታዊ ሀሳብ ይስጡ።',
    cancel: 'ሰርዝ',
    close: 'ዝጋ',
    editEvaluation: 'ግምገማ ተቀይር',
    submitPeerEvaluation: 'ተመሳሳይ ግምገማ ቀርብ',
    updateEvaluation: 'ግምገማ ዋና ይግበር',
    submitting: 'በመላክ ላይ...',
  },
};

const PeerEvaluationModal = ({
  open,
  onClose,
  evaluation = {},
  onSubmit,
  onSubmitted,
  isSubmitting = false,
  successMessage = '',
  errorMessage = '',
  mode = 'create',
  evaluationRecord = null,
}) => {
  const [responses, setResponses] = useState({});
  const [strengths, setStrengths] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isEditMode, setIsEditMode] = useState(mode === 'edit');
  const [criteria, setCriteria] = useState([]);
  const [criteriaError, setCriteriaError] = useState('');
  const [language, setLanguage] = useState('en');
  const [activeDeadline, setActiveDeadline] = useState('');
  const isAraEvaluation = String(evaluation?.target_role || evaluation?.target_type || evaluation?.target_role_name || '').toLowerCase() === 'lab_assistant';

  useEffect(() => {
    if (!open) return;
    setCriteriaError('');
    if (isAraEvaluation) {
      setCriteria(araPeerCriteria.map((item, index) => ({ id: index + 1, category: 'ARA Criteria', criterion_text: item.en, criterion_text_am: item.am })));
      return undefined;
    }
    criteriaApi.get('peer', 'lab_assistant').then((rows) => {
      const criteriaRows = Array.isArray(rows) ? rows : rows?.data || rows?.criteria || [];
      setCriteria(criteriaRows.length >= 19 ? criteriaRows.slice(0, 19) : araPeerCriteria.map((item, index) => ({ id: index + 1, category: 'ARA Criteria', criterion_text: item.en, criterion_text_am: item.am })));
    }).catch((error) => {
      setCriteria([]);
      setCriteriaError(error?.message || 'Unable to load peer evaluation criteria.');
    });
  }, [open, isAraEvaluation]);

  useEffect(() => {
    if (!open) return;

    const nextResponses = (() => {
      const record = evaluationRecord || evaluation;
      if (!record) return {};
      const savedResponses = record.responses || record.answers || record.ratings;
      if (typeof savedResponses === 'string') {
        try {
          return JSON.parse(savedResponses);
        } catch {
          return {};
        }
      }
      return savedResponses || {};
    })();

    setResponses(nextResponses);
    setStrengths((evaluationRecord || evaluation)?.strengths || '');
    setSuggestions((evaluationRecord || evaluation)?.suggestions || '');
    setSubmitError('');
    setSubmitSuccess('');
    setIsEditMode(mode === 'edit');
    setActiveDeadline(evaluation?.deadline || evaluationRecord?.deadline || '');
    evaluationApi.getActiveEvaluationDeadline()
      .then((result) => {
        if (result?.deadlineAt) setActiveDeadline(result.deadlineAt);
      })
      .catch(() => {});
  }, [open, evaluationRecord, mode]);

  useEffect(() => {
    setSubmitError(errorMessage || '');
  }, [errorMessage]);

  useEffect(() => {
    setSubmitSuccess(successMessage || '');
  }, [successMessage]);

  const isReadOnly = mode === 'view' && !isEditMode;
  const deadlineState = useMemo(() => getDeadlineState(activeDeadline || evaluation?.deadline || evaluationRecord?.deadline), [activeDeadline, evaluation?.deadline, evaluationRecord?.deadline]);
  const deadlineLocked = deadlineState.expired && !isReadOnly;
  const peerEvaluationId = evaluation?.id ?? evaluation?.peer_evaluation_id ?? evaluation?.evaluation_id;
  const criteriaSections = groupCriteriaByCategory(criteria);
  const totalItems = useMemo(() => criteriaSections.reduce((sum, section) => sum + (section.criteria?.length || 0), 0), [criteriaSections]);
  const totalScore = useMemo(() => calculateLikertPercentage(responses), [responses]);
  let globalQuestionNumber = 1;

  const buildDefaultResponses = (nextCriteria) => Object.fromEntries(
    (nextCriteria || []).map((item) => [String(item.id), null])
  );

  const setAnswer = (id, value) => setResponses((prev) => ({ ...prev, [id]: value }));

  useEffect(() => {
    if (!open || !criteria.length || isReadOnly) return;
    const hasSavedResponses = Object.keys(responses).length > 0;
    if (!hasSavedResponses) {
      setResponses(buildDefaultResponses(criteria));
    }
  }, [open, criteria, isReadOnly, responses]);

  const handleEditClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsEditMode(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!peerEvaluationId) {
      setSubmitError('No peer evaluation selected. Please contact your administrator.');
      return;
    }
    if (deadlineLocked) {
      setSubmitError('Deadline Passed - Contact Dept Head');
      return;
    }

    // Validate that all criteria have been answered
    const allItemIds = criteriaSections.reduce((acc, section) => acc.concat((section.criteria || []).map(item => String(item.id))), []);
    const unansweredItems = allItemIds.filter(id => !hasLikertResponse(responses[id]));
    
    if (unansweredItems.length > 0) {
      setSubmitError(`Please answer all criteria questions before submitting. ${unansweredItems.length} question(s) remaining.`);
      return;
    }

    const feedbackValidation = validatePeerEvaluationFeedbackPair(strengths, suggestions);
    if (!feedbackValidation.valid) {
      setSubmitError(feedbackValidation.errors[0]);
      return;
    }

    try {
      await onSubmit({
        peer_evaluation_id: peerEvaluationId,
        score: Number(totalScore.toFixed(2)),
        strengths,
        suggestions,
        responses,
      });
      setSubmitSuccess('Peer evaluation submitted successfully.');
      onSubmitted?.(evaluation);
    } catch (error) {
      setSubmitError(error?.message || 'Unable to submit peer evaluation.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[calc(100vh-80px)] overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{uiLabels[language]?.title || uiLabels.en.title}</h2>
            <p className="text-sm text-gray-500">{uiLabels[language]?.description || uiLabels.en.description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <FaTimes />
          </button>
        </div>

        <div className="relative space-y-4 p-6 overflow-y-auto max-h-[calc(100vh-160px)] pr-6 pb-24">
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{uiLabels[language]?.scale || uiLabels.en.scale}</p>
                <p className="text-sm text-gray-600">{uiLabels[language]?.scaleDescription || uiLabels.en.scaleDescription}</p>
              </div>
              <LanguageToggle language={language} onChange={setLanguage} />
              {mode === 'view' && !isEditMode && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700">View Mode</span>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{uiLabels[language]?.araName || uiLabels.en.araName}</p>
              <p className="mt-2 font-semibold text-gray-900">{evaluation.instructor_name || 'N/A'}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 lg:col-span-2"><p className="text-xs uppercase tracking-[0.2em] text-gray-500">Deadline</p><span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${deadlineToneClasses[deadlineState.tone]}`}>{deadlineState.tone === 'warning' ? <Clock3 size={13} /> : null}{deadlineState.label}</span></div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{uiLabels[language]?.department || uiLabels.en.department}</p>
              <p className="mt-2 font-semibold text-gray-900">{evaluation.department_name || 'N/A'} / {evaluation.college_name || 'N/A'}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{uiLabels[language]?.academicYear || uiLabels.en.academicYear}</p>
              <p className="mt-2 font-semibold text-gray-900">{evaluation.academic_year || new Date().getFullYear()}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{uiLabels[language]?.semester || uiLabels.en.semester}</p>
              <p className="mt-2 font-semibold text-gray-900">{evaluation.semester || 'Semester I'}</p>
            </div>
          </div>

          {criteriaError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{criteriaError}</div> : null}
          {submitError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{submitError}</div> : null}
          {submitSuccess ? <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{submitSuccess}</div> : null}

          <form id="peer-evaluation-form" onSubmit={handleSubmit} className="space-y-5">
            {criteriaSections.map((section) => (
              <div key={section.category} className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="font-semibold text-gray-900">{section.category === 'ARA Criteria' ? (uiLabels[language]?.araCriteria || uiLabels.en.araCriteria) : section.category}</h3>
                <div className="mt-4 space-y-3">
                  {(section.criteria || []).map((item) => {
                    const questionNumberValue = globalQuestionNumber++;
                    return (
                      <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex-1 pr-4 text-sm font-medium text-gray-700">
                          <span className="mr-3 font-mono text-gray-400">{questionNumberValue}.</span>
                          {getQuestionText(item, language)}
                        </p>

                        <div className="flex items-center gap-2 shrink-0">
                          {LIKERT_OPTIONS.map((value) => {
                            const selected = String(responses[item.id]) === String(value);
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => !isReadOnly && !deadlineLocked && setAnswer(item.id, value)}
                                disabled={isReadOnly || deadlineLocked}
                                  className={`flex h-9 ${value === 'NA' ? 'w-12' : 'w-9'} items-center justify-center rounded-full text-sm font-semibold transition-all duration-150 ${
                                  selected
                                    ? 'scale-105 bg-blue-600 text-white shadow-md shadow-blue-200 ring-2 ring-blue-300'
                                    : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
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
                  <p className="text-sm font-semibold text-gray-800">{uiLabels[language]?.overallScore || uiLabels.en.overallScore}</p>
                  <p className="text-xs text-gray-500">{uiLabels[language]?.calculatedFrom || uiLabels.en.calculatedFrom}</p>
                </div>
                <div className="rounded-full bg-ieps-blue-50 px-4 py-2 text-sm font-semibold text-ieps-blue-700">{totalScore.toFixed(1)} / 100</div>
              </div>
            </div>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block font-medium">{uiLabels[language]?.strengths || uiLabels.en.strengths}</span>
              <textarea
                rows={3}
                value={strengths}
                onChange={(event) => setStrengths(event.target.value)}
                disabled={isReadOnly}
                className="w-full rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 disabled:cursor-default disabled:bg-gray-50"
                placeholder={uiLabels[language]?.strengthsPlaceholder || uiLabels.en.strengthsPlaceholder}
              />
            </label>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block font-medium">{uiLabels[language]?.suggestions || uiLabels.en.suggestions}</span>
              <textarea
                rows={3}
                value={suggestions}
                onChange={(event) => setSuggestions(event.target.value)}
                disabled={isReadOnly}
                className="w-full rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 disabled:cursor-default disabled:bg-gray-50"
                placeholder={uiLabels[language]?.suggestionsPlaceholder || uiLabels.en.suggestionsPlaceholder}
              />
            </label>

            <div className="h-16" />
          </form>
        </div>

        <div className="sticky bottom-0 left-0 z-20 border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {mode === 'view' && !isEditMode ? (uiLabels[language]?.close || uiLabels.en.close) : (uiLabels[language]?.cancel || uiLabels.en.cancel)}
            </button>

            {mode === 'view' && !isEditMode ? (
              <button type="button" onClick={handleEditClick} className="rounded-full bg-gray-700 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800">
                {uiLabels[language]?.editEvaluation || uiLabels.en.editEvaluation}
              </button>
            ) : (
              <button type="submit" form="peer-evaluation-form" disabled={isSubmitting || isReadOnly || deadlineLocked} className="rounded-full bg-ieps-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ieps-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? (uiLabels[language]?.submitting || uiLabels.en.submitting) : mode === 'view' ? (uiLabels[language]?.updateEvaluation || uiLabels.en.updateEvaluation) : (uiLabels[language]?.submitPeerEvaluation || uiLabels.en.submitPeerEvaluation)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeerEvaluationModal;
