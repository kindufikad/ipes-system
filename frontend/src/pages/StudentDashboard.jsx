import { useEffect, useMemo, useState, useContext } from 'react';
import { FaStar, FaClipboardCheck, FaHome } from 'react-icons/fa';
import { LanguageContext } from '../context/LanguageContext';
import { useTranslation } from '../context/useTranslation';
import { completeWorkflowTask, getWorkflowSnapshot } from '../services/workflowState';
import { SUBMISSIONS_UPDATED_EVENT } from '../services/formSubmissions';
import { criteriaApi, evaluationApi, studentApi } from '../services/api';
import LanguageToggle from '../components/LanguageToggle';
import StudentEvaluationModal from '../components/StudentEvaluationModal';
import TelegramLinkBanner from '../components/TelegramLinkBanner';
import { useAuth } from '../context/useAuth';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';
import { calculateLikertPercentage, hasLikertResponse } from '../utils/likertScoring';

const resolveTranslationValue = (value, fallback = '', preferredLanguage = 'en') => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => resolveTranslationValue(item, '', preferredLanguage)).filter(Boolean).join(' ');
  if (value && typeof value === 'object') {
    if ('en' in value || 'am' in value || 'default' in value) {
      return value[preferredLanguage] || value.en || value.am || value.default || fallback;
    }
    return Object.fromEntries(Object.entries(value).map(([key, childValue]) => [key, resolveTranslationValue(childValue, '', preferredLanguage)]));
  }
  return fallback;
};

const normalizeTranslations = (value, language = 'en') => {
  if (Array.isArray(value)) return value.map((item) => normalizeTranslations(item, language));
  if (value && typeof value === 'object') {
    if ('en' in value || 'am' in value || 'default' in value) return resolveTranslationValue(value, '', language);
    return Object.fromEntries(Object.entries(value).map(([key, childValue]) => [key, normalizeTranslations(childValue, language)]));
  }
  return value;
};

const getTranslationValue = (value, fallback = '') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => getTranslationValue(item, '')).filter(Boolean).join(' ');
  return fallback;
};

const getTranslationByPath = (value, path, fallback = '') => {
  const tokens = path.split('.');
  let current = value;
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') return fallback;
    current = current[token];
  }
  return getTranslationValue(current, fallback);
};

const studentEvaluationSections = [
  {
    title: { en: 'መሠረታዊ ብቃት (Core Competency)', am: 'መሠረታዊ ብቃት' },
    items: [
      { id: 's1', en: 'The course objective, content, and relevance are clearly stated.', am: 'የትምህርቱ ዓላማ፣ ይዘት እና አስፈላጊነት በግልጽ ተገልጿል።' },
      { id: 's2', en: 'The instructor prepares and shares a well-structured course outline.', am: 'መምህሩ በደንብ የተደራጀ የኮርስ እቅድ አዘጋጅቶ ይሰጣል።' },
      { id: 's3', en: 'Relevant reference books and supplemental materials are prepared.', am: 'ተጨማሪ እና ተዛማጅ የማጣቀሻ መጽሐፍት ተዘጋጅተዋል።' },
      { id: 's4', en: 'The instructor provides practical activities such as labs, field visits, or case studies.', am: 'መምህሩ እንደ ላብራቶሪ፣ የመስክ ጉብኝት ወይም አጉሊ ምሳሌ ተግባራዊ ተግባራት ይሰጣል።' },
      { id: 's5', en: 'The instructor demonstrates strong foundational knowledge and skill in the subject.', am: 'መምህሩ በትምህርቱ ላይ ጠንካራ መሰረታዊ እውቀት እና ብቃት ያሳያል።' },
      { id: 's6', en: 'The instructor links theory to practice and real-life examples.', am: 'መምህሩ ሕንፃን እና ታሪክን በእውነተኛ ህይወት ምሳሌዎች ይያዛል።' },
    ],
  },
  {
    title: { en: 'የሙያ ብቃት (Professional Competency)', am: 'የሙያ ብቃት' },
    items: [
      { id: 's7', en: 'The instructor communicates clearly and uses appropriate teaching aids.', am: 'መምህሩ በግልጽ ይገልጻል እና ተገቢ የማስተማሪያ መሳሪያዎችን ይጠቀማል።' },
      { id: 's8', en: 'The instructor provides timely feedback on classwork, homework, and quizzes.', am: 'መምህሩ በትምህርት ስራ፣ ቤት ስራ እና ካውዚ ላይ በወቅቱ አስተያየት ይሰጣል።' },
      { id: 's9', en: 'The instructor encourages cooperative learning and active participation in class.', am: 'መምህሩ የጋራ መማር እና ንቁ ተሳትፎን በክፍል ውስጥ ያበረታታል።' },
      { id: 's10', en: 'The instructor uses continuous assessment effectively and communicates results clearly.', am: 'መምህሩ ቀጣይነት ያለው ተግባር በብቃት ይጠቀማል እና ውጤቶቹን በግልጽ ይገልጻል።' },
      { id: 's11', en: 'The instructor provides appropriate support to both low-achieving and high-achieving students.', am: 'መምህሩ ለዝቅተኛ እና ከፍተኛ ውጤት ያላቸው ተማሪዎች ተገቢ ድጋፍ ይሰጣል።' },
      { id: 's12', en: 'The instructor demonstrates professionalism in communication and conduct.', am: 'መምህሩ በግንኙነት እና በፍትሃዊነት ሙያዊነት ያሳያል።' },
      { id: 's13', en: 'The instructor integrates technology and resources to support learning.', am: 'መምህሩ ለመማር ቴክኖሎጂን እና ምንጮችን ያጠቀማል።' },
      { id: 's14', en: 'The instructor creates a respectful and inclusive classroom environment.', am: 'መምህሩ ክፍለ ትምህርት በክብር እና በአካባቢ ያስተዳድራል።' },
    ],
  },
  {
    title: { en: 'የሥነ-ምግባር ብቃት (Ethical Competency)', am: 'የሥነ-ምግባር ብቃት' },
    items: [
      { id: 's15', en: 'The instructor treats students with respect and creates a supportive learning environment.', am: 'መምህሩ ተማሪዎችን በአክብሮት ይይዛል እና የማስተማር አካባቢን ይደግፋል።' },
      { id: 's16', en: 'The instructor accepts student questions patiently and allows them to express ideas freely.', am: 'መምህሩ የተማሪዎችን ጥያቄዎች በትዕግስት ይቀበላል እና ሀሳባቸውን በነጻነት እንዲገልጹ ያስችላል።' },
      { id: 's17', en: 'The instructor handles students impartially and fairly.', am: 'መምህሩ ተማሪዎችን እኩል አድልዎ እንዳይኖር በፍትሃዊነት ይቆጣጠራል።' },
      { id: 's18', en: 'The instructor demonstrates professional ethics and strong discipline.', am: 'መምህሩ ሙያዊ ስነ-ምግባር እና ጥንካሬ ያለው ባህሪ ያሳያል።' },
    ],
  },
  {
    title: { en: 'የጊዜ አጠቃቀም (Time Management)', am: 'የጊዜ አጠቃቀም' },
    items: [
      { id: 's19', en: 'The instructor maintains consistency in class delivery and follow-up.', am: 'መምህሩ በክፍል አቅርቦት እና ተከታታይ ክትትል ላይ ይቆጣጠራል።' },
      { id: 's20', en: 'The instructor responds to student concerns and progress updates in a timely way.', am: 'መምህሩ የተማሪዎችን ጥያቄ እና እድገት በወቅቱ ይመልሳል።' },
    ],
  },
];

const StudentDashboard = () => {
  const { strings: rawStrings, language } = useContext(LanguageContext);
  const { t: localeT } = useTranslation();
  const { user, role, isAuthenticated, authToken } = useAuth();
  const strings = useMemo(() => normalizeTranslations(rawStrings, language), [rawStrings, language]);
  const t = (path, fallback = '') => getTranslationByPath(strings, path, fallback);
  const renderText = (value, fallback = '') => resolveTranslationValue(value, fallback, language);

  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [pendingCourses, setPendingCourses] = useState([]);
  const [pendingDispatches, setPendingDispatches] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedDispatch, setSelectedDispatch] = useState(null);
  const [studentResponses, setStudentResponses] = useState({});
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentModalMode, setStudentModalMode] = useState('create');
  const [studentModalRecord, setStudentModalRecord] = useState(null);
  const [studentModalLoading, setStudentModalLoading] = useState(false);
  const [studentModalError, setStudentModalError] = useState('');
  const [studentModalSuccess, setStudentModalSuccess] = useState('');
  const [error, setError] = useState('');
  const [workflowSummary, setWorkflowSummary] = useState(() => getWorkflowSnapshot());
  const [dynamicStudentSections, setDynamicStudentSections] = useState([]);
  const [criteriaLanguage, setCriteriaLanguage] = useState('en');
  useEffect(() => {
    setCriteriaLanguage(language);
  }, [language]);
  const handleAiAction = (actionType) => {
    if (actionType === 'VIEW_PENDING_EVALUATIONS') setActiveTab('my-evaluations');
  };
  useEffect(() => {
    criteriaApi.get('student').then((rows) => {
      const grouped = (Array.isArray(rows) ? rows : []).reduce((result, criterion) => {
        const category = criterion.category || 'General';
        const section = result.find((item) => item.title.en === category);
        const item = { id: String(criterion.id), en: criterion.criterion_text, am: criterion.criterion_text_am || criterion.criterion_text };
        if (section) section.items.push(item);
        else result.push({ title: { en: category, am: category }, items: [item] });
        return result;
      }, []);
      if (grouped.length) setDynamicStudentSections(grouped);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (role !== 'student' || !isAuthenticated || !authToken || !user || user.isFirstLogin === true) {
      setLoading(false);
      setProfile(null);
      setPendingDispatches([]);
      setPendingCourses([]);
      return;
    }

    const loadDashboardData = async () => {
      setLoading(true);
      setError('');
      try {
        const [profileData, pendingDispatchesData] = await Promise.all([
          studentApi.getProfile().catch(() => null),
          evaluationApi.getPendingStudentEvaluations().catch(() => []),
        ]);
        setProfile(profileData || null);
        const dispatches = Array.isArray(pendingDispatchesData) ? pendingDispatchesData : [];
        setPendingDispatches(dispatches);
        setPendingCourses(dispatches);
      } catch (fetchError) {
        console.error(fetchError);
        setError(fetchError?.message || 'Unable to load student dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    void loadDashboardData();
  }, [authToken, isAuthenticated, role, user]);

  useEffect(() => {
    const refreshDispatches = async () => {
      if (role !== 'student' || !isAuthenticated || !authToken) return;
      try {
        const pendingDispatchesData = await evaluationApi.getPendingStudentEvaluations();
        setPendingDispatches(Array.isArray(pendingDispatchesData) ? pendingDispatchesData : []);
      } catch {
        setPendingDispatches([]);
      }
    };
    window.addEventListener(SUBMISSIONS_UPDATED_EVENT, refreshDispatches);
    return () => window.removeEventListener(SUBMISSIONS_UPDATED_EVENT, refreshDispatches);
  }, [authToken, isAuthenticated, role]);

  useEffect(() => {
    const refreshWorkflow = () => setWorkflowSummary(getWorkflowSnapshot());
    refreshWorkflow();
    if (typeof window !== 'undefined') {
      window.addEventListener('ipes-evaluation-workflow-updated', refreshWorkflow);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('ipes-evaluation-workflow-updated', refreshWorkflow);
      }
    };
  }, []);

  const activeEvaluationSections = useMemo(
    () =>
      (dynamicStudentSections.length ? dynamicStudentSections : studentEvaluationSections).map((section) => ({
        ...section,
        title: resolveTranslationValue(section.title, '', criteriaLanguage),
        items: section.items.map((item) => ({
          ...item,
          en: resolveTranslationValue(item.en, '', 'en'),
          am: resolveTranslationValue(item.am, '', 'am'),
        })),
      })),
    [criteriaLanguage, dynamicStudentSections]
  );

  const totalScore = useMemo(() => calculateLikertPercentage(studentResponses), [studentResponses]);

  const isCompletedEvaluation = (course) => Boolean(course?.is_evaluated)
    || ['submitted', 'completed', 'approved', 'evaluated'].includes(String(course?.submission_status || course?.status || course?.evaluation_status || '').toLowerCase());
  const pendingCount = pendingCourses.filter((course) => !isCompletedEvaluation(course)).length;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ipes-pending-evaluations-updated', { detail: { count: pendingCount } }));
    return () => window.dispatchEvent(new CustomEvent('ipes-pending-evaluations-updated', { detail: { count: 0 } }));
  }, [pendingCount]);
  const completedCount = pendingCourses.filter(isCompletedEvaluation).length;
  const totalCourses = pendingCourses.length;
  const fullNameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
  const getStudentFullName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.user?.first_name && profile?.user?.last_name) {
      return `${profile.user.first_name} ${profile.user.last_name}`;
    }

    let storedUser = {};
    try {
      storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      storedUser = {};
    }

    if (storedUser?.first_name && storedUser?.last_name) {
      return `${storedUser.first_name} ${storedUser.last_name}`;
    }
    if (storedUser?.full_name && !storedUser.full_name.includes('.')) {
      return storedUser.full_name;
    }
    if (profile?.full_name && profile.full_name.trim() !== '' && !profile.full_name.includes('.')) {
      return profile.full_name;
    }

    const rawUsername = profile?.username || storedUser?.username;
    if (rawUsername && rawUsername.includes('.')) {
      const parts = rawUsername.split('.').filter(Boolean);
      const formattedFirst = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
      const formattedLast = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';
      if (formattedFirst || formattedLast) {
        return `${formattedFirst} ${formattedLast}`.trim();
      }
    }

    if (profile?.username === 'abebe.b' || rawUsername === 'abebe.b') {
      return 'Abebe Bikila';
    }

    return fullNameParts.length ? fullNameParts.join(' ') : 'Student';
  };
  const sidebarItems = [
    { key: 'overview', label: t('studentDashboard.overview'), icon: FaHome },
    { key: 'my-evaluations', label: t('studentDashboard.myEvaluations'), icon: FaClipboardCheck },
  ];

  const findDispatchForCourse = (course) => {
    if (!course) return null;
    if (course.id) return course;
    return (
      pendingDispatches.find((dispatch) => dispatch.course_code === course.course_code || dispatch.course_name === course.course_name || dispatch.course_code === course.code) || null
    );
  };

  const openEvaluation = (course, mode = 'create', record = null) => {
    setSelectedCourse(course);
    setSelectedDispatch(findDispatchForCourse(course));
    setStudentModalMode(mode);
    setStudentModalRecord(record);
    setStudentResponses({});
    setFeedback('');
    setSubmitted(false);
    setShowStudentModal(true);

    if (record) {
      const parsedResponses = typeof record.responses === 'string' ? JSON.parse(record.responses || '{}') : (record.responses || {});
      setStudentResponses(parsedResponses);
      setFeedback(record.feedback || record.comment || '');
    }
  };

  const getInstructorName = (course) => course?.instructor_name?.trim() || course?.instructor?.trim() || 'Assigned Instructor';
  const getScoreValue = (item) => Number(item?.total_score ?? item?.score ?? item?.totalScore ?? item?.overall_score ?? 0) || 0;
  const canEditEvaluation = (evaluation) => {
    if (!evaluation?.is_evaluated && !evaluation?.submission_id) return false;
    if (!evaluation.editable_until) return false;
    const editableUntil = new Date(evaluation.editable_until).getTime();
    return Number.isFinite(editableUntil) && editableUntil > Date.now();
  };

  const renderCourseAction = (course) => {
    const status = String(course?.status || course?.evaluation_status || '').toLowerCase();
    const isEvaluated = Boolean(course?.is_evaluated || status === 'submitted' || status === 'completed' || status === 'evaluated');
    const scoreValue = getScoreValue(course);

    if (isEvaluated) {
      const editable = canEditEvaluation(course);
      return (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
            ✓ Submitted ({scoreValue}/100)
          </span>
          <button
            type="button"
            onClick={() => editable && openEvaluation(course, 'view', course)}
            disabled={!editable}
            className={`text-sm font-semibold underline transition-colors ${editable ? 'text-blue-600 hover:text-blue-800' : 'cursor-not-allowed text-gray-400 no-underline'}`}
          >
            {editable ? 'Edit Evaluation' : 'Submitted (Locked)'}
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => openEvaluation(course, 'create', null)}
        className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
      >
        <FaStar /> {t('studentDashboard.evaluate')}
      </button>
    );
  };

  const handleStudentEvaluationSubmit = async (payload) => {
    setStudentModalLoading(true);
    setStudentModalError('');
    setStudentModalSuccess('');
    try {
      await evaluationApi.submitStudentEvaluationForm(payload);
      setStudentModalSuccess('Student evaluation submitted successfully.');
      setShowStudentModal(false);
      const submittedAt = new Date();
      const editableUntil = new Date(submittedAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const submittedFields = { ...payload, status: 'submitted', submission_status: 'submitted', is_evaluated: true, submitted_at: submittedAt.toISOString(), editable_until: editableUntil, total_score: payload.score };
      setPendingDispatches((current) => current.map((dispatch) => (dispatch.id === payload.dispatch_id ? { ...dispatch, ...submittedFields } : dispatch)));
      setPendingCourses((current) => current.map((course) => (course.id === payload.dispatch_id ? { ...course, ...submittedFields } : course)));
      setSelectedCourse(null);
      setSelectedDispatch(null);
      setSubmitted(true);
      window.dispatchEvent(new CustomEvent(SUBMISSIONS_UPDATED_EVENT, { detail: { type: 'submission' } }));
    } catch (submitError) {
      console.error('Student evaluation submission error:', submitError);
      setStudentModalError(submitError?.message || 'Unable to submit evaluation.');
    } finally {
      setStudentModalLoading(false);
    }
  };

  const goBackToEvaluations = () => {
    try {
      setSelectedCourse(null);
      setSelectedDispatch(null);
      setSubmitted(false);
      setActiveTab('my-evaluations');
    } catch (err) {
      console.error('Error navigating back to evaluations:', err);
    }
  };

  const handleMenuClick = (key) => {
    try {
      if (key === 'student-evaluation') {
        const course = selectedCourse || pendingCourses[0] || null;
        setSelectedCourse(course);
        setSelectedDispatch(course ? findDispatchForCourse(course) : pendingDispatches[0] || null);
        setSubmitted(false);
        setActiveTab('student-evaluation');
        return;
      }
      setActiveTab(key);
      if (key !== 'student-evaluation') {
        setSelectedCourse(null);
        setSelectedDispatch(null);
      }
    } catch (err) {
      console.error('Error handling menu click:', err);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedDispatch) {
      setError('Please select an evaluation to submit.');
      return;
    }
    const unansweredItems = activeEvaluationSections
      .flatMap((section) => section.items)
      .filter((item) => !hasLikertResponse(studentResponses[item.id]));
    if (unansweredItems.length) {
      setError(`Please answer all criteria questions before submitting. ${unansweredItems.length} question(s) remaining.`);
      return;
    }
    const pendingTask = workflowSummary.items.find((item) => item.type === 'student-feedback' && item.status !== 'completed');
    if (pendingTask) {
      completeWorkflowTask(pendingTask.id, {
        summary: `Student submitted feedback for ${selectedCourse?.course_code || selectedDispatch.course_code || 'selected course'}`,
      });
    }
    try {
      await evaluationApi.submitStudentEvaluation({
        dispatch_id: selectedDispatch.id,
        score: Number(totalScore.toFixed(2)),
        feedback,
        responses: studentResponses,
      });
      setSubmitted(true);
      setPendingDispatches((current) => current.map((dispatch) => (dispatch.id === selectedDispatch.id ? { ...dispatch, status: 'submitted' } : dispatch)));
      setPendingCourses((current) => current.map((course) => (course.id === selectedDispatch.id ? { ...course, status: 'submitted' } : course)));
      setSelectedCourse(null);
      setSelectedDispatch(null);
      setError('');
    } catch (submitError) {
      console.error(submitError);
      setError(submitError?.message || 'Unable to submit evaluation.');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="card p-6">
          <p className="text-sm text-gray-600">Loading dashboard data...</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="card rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          <p>{error}</p>
        </div>
      );
    }
    switch (activeTab) {
      case 'my-evaluations':
        return (
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-ieps-blue-600">{t('studentDashboard.myEvaluationsTitle')}</h2>
                <p className="text-sm text-gray-500">{t('studentDashboard.myEvaluationsDesc')}</p>

              </div>
              <div className="rounded-full bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-700">
                {pendingCount} {t('studentDashboard.pendingLabel')}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.courseCode')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.courseName')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.instructor')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{localeT('studentDashboard.type')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.deadline')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCourses.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-sm text-gray-500">{localeT('studentDashboard.noPending')}</td>
                    </tr>
                  ) : (
                    pendingCourses.map((course, index) => (
                      <tr key={`dispatch-${course.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 text-sm font-medium text-gray-800">{course.course_code || course.code || '-'}</td>
                        <td className="py-3 text-sm text-gray-600">{renderText(course.course_name || course.name || '-')}</td>
                        <td className="py-3 text-sm text-gray-600">{getInstructorName(course)}</td>
                        <td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${course.target_type === 'lab_assistant' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{course.target_type === 'lab_assistant' ? localeT('studentDashboard.labAssistant') : localeT('studentDashboard.courseInstructor')}</span></td>
                        <td className="py-3 text-sm text-gray-600">{course.deadline || '2026-08-30'}</td>
                        <td className="py-3">{renderCourseAction(course)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'my-courses':
        return (
          <div className="card">
            <h2 className="text-xl font-bold text-ieps-blue-600 mb-4">{t('studentDashboard.myCourses')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.courseCode')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.courseName')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.instructor')}</th>
                    <th className="text-left py-3 text-sm font-semibold text-gray-500">{t('studentDashboard.deadline')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCourses.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-sm text-gray-500">{localeT('studentDashboard.noCourses')}</td>
                    </tr>
                  ) : (
                    pendingCourses.map((course, index) => (
                      <tr key={`dispatch-${course.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 text-sm font-medium text-gray-800">{course.course_code || course.code || '-'}</td>
                        <td className="py-3 text-sm text-gray-600">{renderText(course.course_name || course.name || '-')}</td>
                        <td className="py-3 text-sm text-gray-600">{getInstructorName(course)}</td>
                        <td className="py-3 text-sm text-gray-600">{course.deadline || '2026-08-30'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'progress':
        return (
          <div className="card">
            <h2 className="text-xl font-bold text-ieps-blue-600 mb-4">{t('studentDashboard.progressTitle')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.completedEvaluations')}</p>
                <p className="mt-2 text-3xl font-bold text-gray-800">{completedCount}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.remainingDeadlines')}</p>
                <p className="mt-2 text-3xl font-bold text-gray-800">{pendingCount}</p>
              </div>
            </div>
          </div>
        );
      case 'profile':
        return (
          <div className="card">
            <h2 className="text-xl font-bold text-ieps-blue-600 mb-4">{t('studentDashboard.studentProfile')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.fullName')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.full_name || profile?.username || profile?.name || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.studentId')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.student_id || profile?.username || profile?.id || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.department')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.department_name || profile?.department || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.programType')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.program_type || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.academicYear')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.year_level || profile?.year || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">{t('studentDashboard.section')}</p>
                <p className="mt-1 font-semibold text-gray-800">{profile?.section || '-'}</p>
              </div>
            </div>
          </div>
        );
      case 'student-evaluation':
        return (
          <div className="card max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
            {selectedDispatch ? (
              <div className="mb-4 rounded-3xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{t('studentDashboard.evaluationRequest')}</p>
                    <p className="text-xs text-green-600 mt-1">{t('studentDashboard.completeEvaluationInstructions')}</p>
                  </div>
                  <span className="text-xs font-semibold bg-green-200 text-green-800 px-2 py-1 rounded-full">{localeT('studentDashboard.pendingStatus')}</span>
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-3xl border border-yellow-100 bg-yellow-50 p-4 text-sm text-yellow-700">
                <p>{t('studentDashboard.noActiveDispatch')}</p>
              </div>
            )}
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-ieps-blue-600">{t('studentDashboard.studentEvaluationForm')}</h2>
                <p className="text-sm text-gray-500">
                  {t('studentDashboard.evaluating')} {renderText(selectedCourse?.course_name || selectedDispatch?.course_name || '-')}
                  {' • '}
                  {selectedCourse?.course_code || selectedDispatch?.course_code || '-'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LanguageToggle language={criteriaLanguage} onChange={setCriteriaLanguage} />
                <div className="rounded-full bg-ieps-blue-50 px-3 py-2 text-sm font-semibold text-ieps-blue-700">
                  {t('studentDashboard.estimatedScore')}: {totalScore.toFixed(1)} / 100
                </div>
              </div>
            </div>
            <p className="mb-2 text-sm text-gray-600">{t('studentDashboard.bilingualInstruction')}</p>
            <p className="mb-4 text-xs text-gray-500">Scale: 1 = Very Low, 2 = Low, 3 = Average, 4 = High, 5 = Very High, N/A = Not Applicable</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              {activeEvaluationSections.map((section, sectionIndex) => (
                <div key={`section-${section.title}-${sectionIndex}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="font-semibold text-gray-800">{section.title}</h3>
                  <div className="mt-3 space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <div key={`item-${item.id}-${itemIndex}`} className="rounded-2xl border border-gray-100 bg-white p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1 space-y-1">
                            <p className="text-sm text-gray-700">{criteriaLanguage === 'am' ? (item.am || item.en) : item.en}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5, 'N/A'].map((value) => (
                              <label key={value} className={`rounded-full border px-3 py-1 text-sm ${studentResponses[item.id] === value ? (value === 'N/A' ? 'border-slate-700 bg-slate-700 text-white' : 'border-ieps-blue-600 bg-ieps-blue-600 text-white') : (value === 'N/A' ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-gray-200 bg-white text-gray-700')}`}>
                                <input
                                  type="radio"
                                  name={item.id}
                                  value={value}
                                  checked={studentResponses[item.id] === value}
                                  onChange={() => setStudentResponses((prev) => ({ ...prev, [item.id]: value }))}
                                  className="sr-only"
                                />
                                {value}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <label className="block text-sm text-gray-700">
                <span className="mb-1 block font-medium">{t('studentDashboard.additionalFeedback')}</span>
                <textarea rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2" placeholder={t('studentDashboard.feedbackPlaceholder')} />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="rounded-full bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedDispatch}>
                  {t('studentDashboard.submitEvaluation')}
                </button>
                <button type="button" onClick={goBackToEvaluations} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
                  {t('common.back')}
                </button>
              </div>
              {submitted ? <p className="text-sm text-green-600">{t('studentDashboard.successMessage')}</p> : null}
            </form>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            <IPESAISmartInsights role="STUDENT" onActionClick={handleAiAction} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 text-center shadow-sm">
                <p className="text-3xl font-bold text-ieps-blue-600">{totalCourses}</p>
                <p className="mt-2 text-sm text-gray-500">{localeT('studentDashboard.totalCourses')}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 text-center shadow-sm">
                <p className="text-3xl font-bold text-ieps-gold-600">{pendingCount}</p>
                <p className="mt-2 text-sm text-gray-500">{t('studentDashboard.pendingLabel')}</p>
              </div>
              <div className="rounded-3xl border border-gray-200 bg-white p-5 text-center shadow-sm">
                <p className="text-3xl font-bold text-green-600">{completedCount}</p>
                <p className="mt-2 text-sm text-gray-500">{localeT('studentDashboard.completed')}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('my-evaluations')}
                className="w-full max-w-lg rounded-3xl bg-ieps-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-ieps-blue-700 sm:w-auto"
              >
                {localeT('studentDashboard.startPending')}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="container-custom py-8">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-sky-200 bg-sky-100 p-6 text-slate-800 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Mekdela Amba University</p>
            <h1 className="mt-1 text-2xl font-extrabold text-sky-950 md:text-3xl">{localeT('studentDashboard.welcome')}, {getStudentFullName()}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1 text-xs font-medium md:text-sm">
          <span className="rounded-full border border-sky-300/60 bg-sky-200/80 px-3 py-1 text-sky-950">
            <strong>{localeT('studentDashboard.id')}</strong> {profile?.student_id || profile?.username || 'N/A'}
          </span>
          <span className="rounded-full border border-sky-300/60 bg-sky-200/80 px-3 py-1 text-sky-950">
            <strong>{t('common.department')}:</strong> {profile?.department_name || profile?.department || 'N/A'}
          </span>
          <span className="rounded-full border border-sky-300/60 bg-sky-200/80 px-3 py-1 text-sky-950">
            <strong>{localeT('studentDashboard.program')}</strong> {profile?.program_type || profile?.program || 'N/A'}
          </span>
          <span className="rounded-full border border-sky-300/60 bg-sky-200/80 px-3 py-1 text-sky-950">
            <strong>{localeT('studentDashboard.yearLevel')}</strong> {profile?.year_level || 'N/A'}
          </span>
          <span className="rounded-full border border-sky-300/60 bg-sky-200/80 px-3 py-1 text-sky-950">
            <strong>{localeT('studentDashboard.section')}:</strong> {profile?.section ? `${localeT('studentDashboard.section')} ${profile.section}` : 'N/A'}
          </span>
        </div>
      </div>

      <TelegramLinkBanner profile={profile} />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 mb-8">
        <aside className="rounded-none border-0 bg-transparent p-0 shadow-none">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('studentDashboard.menu')}</h3>
          <div className="space-y-1">
            {sidebarItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleMenuClick(key)}
                className={`flex w-full items-center gap-3 rounded-none px-0 py-2 text-left text-sm transition ${activeTab === key ? 'text-ieps-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </aside>
        <div className="space-y-6">{renderContent()}</div>
      </div>
      <StudentEvaluationModal
        open={showStudentModal}
        onClose={() => {
          setShowStudentModal(false);
          setStudentModalMode('create');
          setStudentModalRecord(null);
        }}
        course={selectedCourse || {}}
        dispatchItem={selectedDispatch}
        sections={activeEvaluationSections}
        onSubmit={handleStudentEvaluationSubmit}
        isSubmitting={studentModalLoading}
        successMessage={studentModalSuccess}
        errorMessage={studentModalError}
        mode={studentModalMode}
        evaluationRecord={studentModalRecord}
      />
    </div>
  );
};

export default StudentDashboard;