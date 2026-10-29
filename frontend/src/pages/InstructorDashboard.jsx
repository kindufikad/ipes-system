import { useContext, useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { FaClipboardCheck, FaUsers, FaChartBar, FaStar, FaBookOpen } from 'react-icons/fa';
import { LanguageContext } from '../context/LanguageContext';
import { useTranslation } from '../context/useTranslation';
import PeerEvaluationModal from '../components/PeerEvaluationModal';
import PerformanceDashboard from '../components/PerformanceDashboard';
import { aiApi, authApi, courseAssignmentApi, evaluationApi } from '../services/api';
import { SUBMISSIONS_UPDATED_EVENT } from '../services/formSubmissions';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';
import { SetGoalModal } from '../components/ai/AIActionModals';
import TelegramLinkBanner from '../components/TelegramLinkBanner';

const InstructorDashboard = () => {
  const { strings } = useContext(LanguageContext);
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(() => {
    if (typeof window === 'undefined') return authUser || null;
    try {
      const storedUser = JSON.parse(window.localStorage.getItem('user') || '{}');
      return storedUser && Object.keys(storedUser).length ? storedUser : authUser || null;
    } catch {
      return authUser || null;
    }
  });
  const [activeView, setActiveView] = useState('performanceDashboard');
  const [peerEvaluations, setPeerEvaluations] = useState([]);
  const [peerPublished, setPeerPublished] = useState(null);
  const [peerPendingCount, setPeerPendingCount] = useState(0);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState('');
  const [showPeerModal, setShowPeerModal] = useState(false);
  const [selectedPeerEvaluation, setSelectedPeerEvaluation] = useState(null);
  const [peerModalMode, setPeerModalMode] = useState('create');
  const [peerModalRecord, setPeerModalRecord] = useState(null);
  const [peerModalLoading, setPeerModalLoading] = useState(false);
  const [peerModalError, setPeerModalError] = useState('');
  const [peerModalSuccess, setPeerModalSuccess] = useState('');
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isGoalSaving, setIsGoalSaving] = useState(false);
  const [goalMessage, setGoalMessage] = useState('');

  const handleAiAction = (actionType) => {
    if (actionType === 'VIEW_FEEDBACK' || actionType === 'VIEW_STUDENT_FEEDBACK') {
      setActiveView('performanceDashboard');
      window.setTimeout(() => document.getElementById('student-feedback-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
    if (actionType === 'SET_GOAL' || actionType === 'SET_TEACHING_GOAL') setIsGoalModalOpen(true);
    if (actionType === 'VIEW_PENDING_EVALUATIONS') setActiveView('peerEvaluation');
  };

  const saveGoal = async (payload) => {
    setIsGoalSaving(true);
    try {
      await aiApi.saveInstructorGoal({ focusArea: payload.focusArea, goal: payload.goal, term: payload.term });
      setGoalMessage('Improvement goal saved successfully.');
      setIsGoalModalOpen(false);
    } catch (error) {
      setGoalMessage(error?.message || 'Unable to save improvement goal.');
    } finally {
      setIsGoalSaving(false);
    }
  };

  const loadPeerEvaluations = async () => {
    setPeerLoading(true);
    setPeerError('');
    try {
      const data = await courseAssignmentApi.getPeerEvaluations();
      const normalizePeerRows = (rows) => (Array.isArray(rows) ? rows : []).map((item) => ({
        ...item,
        id: item.id ?? item.peer_evaluation_id ?? item.evaluation_id,
        peer_evaluation_id: item.peer_evaluation_id ?? item.id ?? item.evaluation_id,
        target_role: ['dept_head', 'department_head', 'depthead'].includes(String(item.target_role || item.instructor_role || '').toLowerCase()) ? 'dept_head' : (item.target_role || 'instructor'),
        status: String(item.status || item.submission_status || 'pending').toLowerCase(),
        isEvaluated: Boolean(item.isEvaluated || item.is_evaluated || ['submitted', 'completed', 'approved'].includes(String(item.status || item.submission_status || '').toLowerCase())),
      })).filter((item) => item.id);
      if (data && typeof data === 'object' && Array.isArray(data.evaluations)) {
        setPeerPublished(data.isPublished !== false);
        const evaluations = normalizePeerRows(data.evaluations);
        setPeerEvaluations(evaluations);
        setPeerPendingCount(Number(data.pendingCount) || evaluations.filter((item) => item.status === 'pending').length);
      } else if (Array.isArray(data)) {
        const evaluations = normalizePeerRows(data);
        setPeerPublished(true);
        setPeerEvaluations(evaluations);
        setPeerPendingCount(evaluations.filter((item) => item.status === 'pending').length);
      } else {
        setPeerPublished(false);
        setPeerEvaluations([]);
        setPeerPendingCount(0);
      }
    } catch (error) {
      console.error('Peer evaluations load failed:', error);
      setPeerError(error?.message || 'Unable to load peer evaluations.');
      // Keep the last assignment list visible during transient refresh/auth state changes.
      setPeerPublished((current) => current !== false ? current : null);
    } finally {
      setPeerLoading(false);
    }
  };

  const getInstructorFullName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.user?.first_name && profile?.user?.last_name) {
      return `${profile.user.first_name} ${profile.user.last_name}`;
    }
    if (profile?.full_name && profile.full_name.trim() !== '') {
      return profile.full_name;
    }
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (storedUser?.first_name && storedUser?.last_name) {
      return `${storedUser.first_name} ${storedUser.last_name}`;
    }
    return profile?.username || storedUser?.username || t('instructorDashboard.tableInstructor');
  };

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const profileData = await authApi.me().catch(() => null);
        if (isMounted) {
          setProfile(profileData || authUser || null);
        }
      } catch {
        if (isMounted) {
          setProfile(authUser || null);
        }
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [authUser]);

  useEffect(() => {
    const handleDispatchUpdate = () => {
      // refresh peer assignments when new submissions happen
      if (activeView === 'peerEvaluation') {
        void loadPeerEvaluations();
      }
    };

    window.addEventListener(SUBMISSIONS_UPDATED_EVENT, handleDispatchUpdate);
    return () => {
      window.removeEventListener(SUBMISSIONS_UPDATED_EVENT, handleDispatchUpdate);
    };
  }, [activeView]);

  useEffect(() => {
    void loadPeerEvaluations();
    const refreshTimer = window.setInterval(() => {
      void loadPeerEvaluations();
    }, 15000);
    return () => window.clearInterval(refreshTimer);
  }, [authUser]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ipes-pending-evaluations-updated', { detail: { count: peerPendingCount } }));
    return () => window.dispatchEvent(new CustomEvent('ipes-pending-evaluations-updated', { detail: { count: 0 } }));
  }, [peerPendingCount]);

  const sidebarItems = [
    { key: 'peerEvaluation', label: t('instructorDashboard.peerEvaluation'), icon: FaUsers, active: activeView === 'peerEvaluation' },
    { key: 'performanceDashboard', label: t('instructorDashboard.performanceDashboard'), icon: FaChartBar, active: activeView === 'performanceDashboard' },
  ];

  const openPeerModal = (evaluation, mode = 'create', record = null) => {
    if (mode === 'create' && peerPublished === false) return;
    const normalizedEvaluation = {
      ...evaluation,
      id: evaluation?.id ?? evaluation?.peer_evaluation_id ?? evaluation?.evaluation_id,
      peer_evaluation_id: evaluation?.peer_evaluation_id ?? evaluation?.id ?? evaluation?.evaluation_id,
    };
    setSelectedPeerEvaluation(normalizedEvaluation);
    setPeerModalMode(mode);
    setPeerModalRecord(record);
    setPeerModalError('');
    setPeerModalSuccess('');
    setShowPeerModal(true);
  };

  const handlePeerEvaluationSubmit = async (payload) => {
    setPeerModalLoading(true);
    setPeerModalError('');
    setPeerModalSuccess('');
    try {
      await evaluationApi.submitPeerEvaluationForm(payload);
      setPeerModalSuccess('Peer evaluation submitted successfully.');
      setShowPeerModal(false);
      setPeerEvaluations((current) => current.map((item) => (item.id === payload.peer_evaluation_id ? { ...item, status: 'completed' } : item)));
      setPeerPendingCount((count) => Math.max(0, count - 1));
      setPeerModalLoading(false);
      window.dispatchEvent(new CustomEvent(SUBMISSIONS_UPDATED_EVENT, { detail: { type: 'peer-submission' } }));
    } catch (submitError) {
      console.error(submitError);
      setPeerModalError(submitError?.message || 'Unable to submit peer evaluation.');
      setPeerModalLoading(false);
      throw submitError;
    }
  };

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);

  const loadPerformanceReport = async () => {
    setReportLoading(true);
    try {
      const data = await evaluationApi.getPerformanceDashboard();
      setReport(data);
    } catch (error) {
      console.error('Failed to load performance report:', error);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    void loadPerformanceReport();
  }, [authUser]);

  const renderContent = () => {
    if (activeView === 'peerEvaluation') {
      return (
        <section className="space-y-6">
          <div className="p-6 bg-white rounded-lg shadow-sm">
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">{strings.instructorDashboard.peerEvaluationTitle}</h2>
                <p className="text-sm text-gray-500">{strings.instructorDashboard.peerEvaluationDesc}</p>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-800 font-medium text-sm rounded-full">
                {peerPendingCount} {t('instructorDashboard.pending')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('instructorDashboard.tableInstructor')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('instructorDashboard.deadline')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('instructorDashboard.action')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {peerLoading ? (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-sm text-gray-500">{t('instructorDashboard.loadingPeer')}</td>
                    </tr>
                  ) : peerError ? (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-sm text-red-600">{peerError}</td>
                    </tr>
                  ) : peerPublished === false ? (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-sm text-gray-500">{t('instructorDashboard.notPublished')}</td>
                    </tr>
                  ) : peerEvaluations.length ? (
                    peerEvaluations.map((row, index) => {
                      const isComplete = row.status === 'completed' || row.status === 'submitted' || row.is_evaluated || row.evaluation_status === 'submitted';
                      const targetLabel = row.target_role === 'dept_head' ? t('deptHeadDashboard.role') : t('instructorDashboard.tableInstructor');
                      const rawScore = row?.raw_score ?? row?.total_score ?? row?.score ?? row?.totalScore ?? row?.overall_score;
                      const numericRawScore = Number(rawScore);
                      const hasRawScore = rawScore !== null
                        && rawScore !== undefined
                        && Number.isFinite(numericRawScore)
                        && numericRawScore > 0;

                      return (
                        <tr key={`peer-${row.id}-${index}`} className="border-b border-gray-100">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">{row.instructor_name || 'Instructor'}<span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{targetLabel}</span></td>
                          <td className="px-4 py-4 text-sm text-gray-600">{row.deadline || '-'}</td>
                          <td className="px-4 py-4 text-sm">
                            {isComplete ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-emerald-600">✓ {t('instructorDashboard.completed')}{hasRawScore ? ` (${numericRawScore}/100)` : ''}</span>
                                <button
                                  type="button"
                                  onClick={() => openPeerModal(row, 'view', row)}
                                  className="text-sm font-semibold text-blue-600 underline transition-colors hover:text-blue-800"
                                >
                                  {t('instructorDashboard.viewDetails')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPeerModal(row, 'edit', row)}
                                  className="text-sm font-semibold text-blue-600 underline transition-colors hover:text-blue-800"
                                >
                                  {t('instructorDashboard.editEvaluation')}
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => openPeerModal(row, 'create', null)} className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-700">
                                <FaStar className="mr-1" /> {t('instructorDashboard.evaluate')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-sm text-gray-500">{t('instructorDashboard.emptyPeer')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    if (activeView === 'performanceDashboard') {
      return <PerformanceDashboard />;
    }

    // Overview with weighted evaluations
    const totalWeightedScore = Number(report?.totalScore ?? report?.totalWeightedScore ?? 0);
    const breakdown = report?.breakdown || {};
    const studentSubmissionCount = Number(report?.submission_count ?? report?.submissionCount ?? breakdown.student?.submissionCount ?? breakdown.student?.count ?? 0);
    const completion = report?.completion || {};
    const hasAssignedCourse = (report?.hasAssignedCourses ?? (report?.hasAssignedCourse !== false))
      || studentSubmissionCount > 0
      || Number(report?.total_assignments ?? report?.totalAssignments ?? 0) > 0;
    const requiredStudentCount = Number(completion.requiredStudentCount ?? report?.student_required ?? report?.required_student_evaluators ?? 0);
    const hasStudentEval = !hasAssignedCourse
      || completion.isStudentComplete === true
      || (requiredStudentCount > 0 && studentSubmissionCount >= Math.ceil(requiredStudentCount / 2));
    const peerSubmissionCount = Number(completion.incomingPeerCount ?? report?.peer_completed ?? breakdown.peer?.count ?? 0);
    const hasPeerEval = completion.isPeerComplete === true || peerSubmissionCount >= 1;
    const hasDeptHeadEval = completion.isDeptHeadComplete === true
      || breakdown.deptHead?.isAvailable === true
      || Number(breakdown.deptHead?.count || 0) > 0;
    const hasAllEvaluations = report?.isComplete === true || (hasStudentEval && hasPeerEval && hasDeptHeadEval);
    const totalScoreLabel = reportLoading
      ? '—'
      : hasAllEvaluations
        ? `${totalWeightedScore.toFixed(1)}%`
        : t('instructorDashboard.pendingEvaluation');
    const totalStatusLabel = reportLoading
      ? 'Loading evaluation status'
      : hasAllEvaluations
        ? (totalWeightedScore >= 90 ? t('instructorDashboard.excellent') : totalWeightedScore >= 85 ? t('instructorDashboard.veryGood') : totalWeightedScore >= 70 ? t('instructorDashboard.satisfactory') : totalWeightedScore >= 50 ? t('instructorDashboard.needsImprovement') : t('instructorDashboard.unsatisfactory'))
        : t('instructorDashboard.pendingAll');
    const totalStatusClass = hasAllEvaluations
      ? 'bg-blue-100 text-blue-700'
      : 'bg-slate-100 text-slate-600';
    
    const evaluationCards = [
      { 
        key: 'student',
        label: 'Student Evaluation', 
        weight: Number(breakdown.student?.weight ?? report?.weights?.student ?? (hasAssignedCourse ? 50 : 0)),
        score: hasAssignedCourse ? Number(breakdown.student?.rawPercentage ?? report?.raw_student_score ?? 0) : null,
        status: !hasAssignedCourse ? 'Not assigned' : hasStudentEval ? 'Satisfied' : studentSubmissionCount > 0 ? 'In progress' : 'Active',
        contribution: Number(breakdown.student?.weightedContribution ?? ((Number(breakdown.student?.rawPercentage ?? report?.raw_student_score ?? 0) * Number(breakdown.student?.weight ?? report?.weights?.student ?? (hasAssignedCourse ? 50 : 0))) / 100)),
        color: 'blue'
      },
      { 
        key: 'deptHead',
        label: 'Dept Head Evaluation', 
        weight: Number(breakdown.deptHead?.weight ?? (hasAssignedCourse ? 30 : 60)),
        score: Number(breakdown.deptHead?.rawPercentage ?? 0),
        contribution: Number(breakdown.deptHead?.weightedContribution ?? 0),
        color: 'amber'
      },
      { 
        key: 'peer',
        label: 'Peer Evaluation', 
        weight: Number(breakdown.peer?.weight ?? (hasAssignedCourse ? 20 : 40)),
        score: Number(breakdown.peer?.rawPercentage ?? 0),
        contribution: Number(breakdown.peer?.weightedContribution ?? 0),
        color: 'purple'
      },
    ];

    const getColorStyles = (color) => {
      const colors = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600', badge: 'bg-blue-200 text-blue-700' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600', badge: 'bg-amber-200 text-amber-700' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-600', badge: 'bg-purple-200 text-purple-700' },
      };
      return colors[color] || colors.blue;
    };

    return (
      <div className="space-y-6">
        {/* Total Weighted Score */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('instructorDashboard.scoreTitle')}</p>
          <p className={`mt-3 text-5xl font-bold ${hasAllEvaluations ? 'text-ieps-blue-700' : 'text-slate-500'}`}>{totalScoreLabel}</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${totalStatusClass}`}>
            {totalStatusLabel}
          </span>
        </div>

        {/* Evaluation Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {evaluationCards.map((card) => {
            const styles = getColorStyles(card.color);
            return (
              <div key={card.key} className={`rounded-2xl border border-gray-200 p-6 shadow-sm ${styles.bg}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className={`text-sm font-medium ${styles.text}`}>{card.label}</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${styles.badge}`}>
                      {card.weight}% {t('instructorDashboard.weight')}
                    </span>
                  </div>
                  {card.status && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasAssignedCourse && hasStudentEval ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{card.status}</span>}
                </div>
                <p className={`text-4xl font-bold ${styles.text} mt-4`}>{reportLoading ? '—' : card.score === null ? 'N/A' : `${Number(card.score).toFixed(card.key === 'student' ? 2 : 1)}%`}</p>
                <p className="mt-1 text-sm text-gray-600">Weighted contribution: {reportLoading ? '—' : `${Number(card.contribution).toFixed(card.key === 'student' ? 2 : 1)}%`}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="container-custom py-8">
      <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-100 via-blue-100 to-sky-50 p-6 text-slate-900 shadow-lg md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Mekdela Amba University</p>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl text-slate-900">{t('instructorDashboard.welcome')}, {getInstructorFullName()}</h1>
            <div className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-slate-800 shadow-sm">
              {t('instructorDashboard.department')}: {profile?.department_name || profile?.department || t('instructorDashboard.notAvailable')}
            </div>
          </div>
        </div>
      </div>

      <TelegramLinkBanner profile={profile} />

      <div className="mb-6">
        <IPESAISmartInsights role="INSTRUCTOR" departmentId={profile?.department_id || authUser?.department_id} userId={profile?.id || authUser?.id} onActionClick={handleAiAction} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('instructorDashboard.menu')}</h3>
          <div className="space-y-2">
            {sidebarItems.map(({ label, icon: Icon, active, key }) => (
              <button key={label} type="button" onClick={() => setActiveView(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${active ? 'bg-ieps-blue-50 text-ieps-blue-600 ring-1 ring-inset ring-gray-300' : 'text-gray-600 hover:bg-gray-50'}`}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </aside>

        <main>{renderContent()}</main>
      </div>
      <PeerEvaluationModal
        open={showPeerModal}
        onClose={() => {
          setShowPeerModal(false);
          setPeerModalMode('create');
          setPeerModalRecord(null);
        }}
        evaluation={selectedPeerEvaluation || {}}
        onSubmit={handlePeerEvaluationSubmit}
        isSubmitting={peerModalLoading}
        successMessage={peerModalSuccess}
        errorMessage={peerModalError}
        mode={peerModalMode}
        evaluationRecord={peerModalRecord}
      />
      <SetGoalModal open={isGoalModalOpen} onClose={() => setIsGoalModalOpen(false)} onSave={saveGoal} isSaving={isGoalSaving} />
      {goalMessage ? <p className="fixed bottom-6 right-6 z-[1101] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{goalMessage}</p> : null}
    </div>
  );
};

export default InstructorDashboard;