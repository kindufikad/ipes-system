import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, Printer, RotateCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTranslation } from '../context/useTranslation';
import VicePresidentEvaluationModal from '../components/VicePresidentEvaluationModal';
import AcademicDirectorateReportPrint from '../components/VicePresidentPrintableReport';
import useLandingContent from '../hooks/useLandingContent';
import { vicePresidentApi } from '../services/api';
import { formatEvaluationDeadline } from '../utils/formatEvaluationDeadline';

const formatDate = (value, language) => formatEvaluationDeadline(value, language === 'am' ? 'am-ET' : 'en-US');
const isEvaluated = (candidate) => Boolean(candidate.evaluation_id || ['submitted', 'completed', 'approved'].includes(String(candidate.evaluation_status || '').toLowerCase()));
const isPerformanceComplete = (performance) => performance?.isComplete === true && performance.totalScore != null;

const VicePresidentDashboard = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const landingContent = useLandingContent();
  const [activeTab, setActiveTab] = useState('evaluate');
  const [candidates, setCandidates] = useState([]);
  const [performanceByCandidate, setPerformanceByCandidate] = useState({});
  const [modalCandidate, setModalCandidate] = useState(null);
  const [modalMode, setModalMode] = useState('create');
  const [modalError, setModalError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [printReportData, setPrintReportData] = useState(null);

  useEffect(() => {
    const requestedTab = location.hash.slice(1);
    setActiveTab(requestedTab === 'academic-report' || requestedTab === 'previous-evaluations' ? 'academic-report' : 'evaluate');
  }, [location.hash]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const candidateRows = await vicePresidentApi.getAcademicDirectorateCandidates();
      const normalizedCandidates = Array.isArray(candidateRows) ? candidateRows : [];
      const performanceEntries = await Promise.all(normalizedCandidates.filter(isEvaluated).map(async (candidate) => {
        try {
          const performance = await vicePresidentApi.getDirectoratePerformance(candidate.academic_directorate_id);
          return [String(candidate.academic_directorate_id), performance];
        } catch {
          return [String(candidate.academic_directorate_id), null];
        }
      }));
      setCandidates(normalizedCandidates);
      setPerformanceByCandidate(Object.fromEntries(performanceEntries.filter(([, performance]) => performance)));
    } catch (loadError) {
      setError(loadError.message || t('vicePresidentDashboard.unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (!printReportData) return undefined;

    let cancelled = false;
    let firstFrame;
    let secondFrame;
    let printTimer;
    const body = document.body;
    const reportShell = document.getElementById('printable-academic-report');
    const clearPrintMode = () => {
      body.classList.remove('printing-vice-president-report');
      setPrintReportData(null);
    };

    const waitForReportAssets = async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const images = Array.from(reportShell?.querySelectorAll('img') || []);
      await Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })));
    };

    body.classList.add('printing-vice-president-report');
    window.addEventListener('afterprint', clearPrintMode, { once: true });
    void waitForReportAssets().then(() => {
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          printTimer = window.setTimeout(() => {
            try {
              window.print();
            } catch (printError) {
              window.removeEventListener('afterprint', clearPrintMode);
              clearPrintMode();
              setError(printError.message || t('vicePresidentDashboard.printDialogError'));
            }
          }, 300);
        });
      });
    }).catch((assetError) => {
      if (cancelled) return;
      window.removeEventListener('afterprint', clearPrintMode);
      clearPrintMode();
      setError(assetError.message || t('vicePresidentDashboard.printPrepareError'));
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(printTimer);
      window.removeEventListener('afterprint', clearPrintMode);
      body.classList.remove('printing-vice-president-report');
    };
  }, [printReportData]);

  const openEvaluation = async (candidate, mode) => {
    setModalError('');
    try {
      const latestCandidates = await vicePresidentApi.getAcademicDirectorateCandidates();
      const latestCandidate = (Array.isArray(latestCandidates) ? latestCandidates : []).find(
        (row) => Number(row.academic_directorate_id) === Number(candidate.academic_directorate_id)
      );
      if (!latestCandidate) throw new Error('This evaluation candidate is no longer available. Refresh the page and try again.');
      setCandidates(latestCandidates);
      setModalCandidate(latestCandidate);
      setModalMode(mode);
    } catch (loadError) {
      setError(loadError?.message || t('vicePresidentDashboard.unableToLoad'));
    }
  };

  const closeEvaluation = () => {
    if (saving) return;
    setModalCandidate(null);
    setModalError('');
  };

  const submitEvaluation = async ({ candidate, ratings, strengths, weaknesses }) => {
    setModalError('');
    setSaving(true);
    try {
      const result = await vicePresidentApi.evaluateAcademicDirectorate({
        academic_directorate_id: Number(candidate.academic_directorate_id),
        ratings,
        strengths,
        weaknesses,
      });
      const weightedScore = Number(result.weighted_score).toFixed(2);
      setMessage(language === 'am'
        ? `ግምገማው ተቀምጧል፡ ${weightedScore} ከ30 ክብደት ያላቸው ነጥቦች።`
        : `Evaluation saved: ${weightedScore} of 30 weighted points.`);
      const updatedAt = new Date().toISOString();
      const savedEvaluation = {
        ...candidate,
        id: candidate.evaluation_id || candidate.academic_directorate_id,
        evaluation_id: candidate.evaluation_id || candidate.academic_directorate_id,
        academic_directorate_id: Number(candidate.academic_directorate_id),
        evaluation_status: result.status || 'COMPLETED',
        status: result.status || 'COMPLETED',
        score: Number(result.score),
        evaluation_score: Number(result.score),
        weighted_score: Number(result.weighted_score),
        ratings,
        strengths,
        weaknesses,
        updated_at: updatedAt,
      };
      setCandidates((current) => current.map((row) => Number(row.academic_directorate_id) === Number(candidate.academic_directorate_id) ? savedEvaluation : row));
      const performance = await vicePresidentApi.getDirectoratePerformance(candidate.academic_directorate_id).catch(() => null);
      if (performance) setPerformanceByCandidate((current) => ({ ...current, [String(candidate.academic_directorate_id)]: performance }));
      setModalCandidate(null);
    } catch (submitError) {
      setModalError(submitError.message || t('vicePresidentDashboard.unableToSubmit'));
    } finally {
      setSaving(false);
    }
  };

  const printPerformanceReport = (evaluation) => {
    setError('');
    const performance = performanceByCandidate[String(evaluation.academic_directorate_id)];
    if (!performance) {
      setError(t('vicePresidentDashboard.reportDataUnavailable'));
      return;
    }

    setPrintReportData(performance);
  };

  return (
    <section className="space-y-6" aria-labelledby="vice-president-dashboard-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold uppercase text-blue-700">{t('vicePresidentDashboard.institutionalEvaluation')}</p>
          <h1 id="vice-president-dashboard-title" className="mt-1 text-2xl font-bold text-slate-900">{t('vicePresidentDashboard.title')}</h1>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" aria-label={t('vicePresidentDashboard.refreshAria')}>
          <RotateCw size={16} className={loading ? 'animate-spin' : ''} /> {t('vicePresidentDashboard.refresh')}
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-10 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />{t('vicePresidentDashboard.loading')}</div>
      ) : activeTab === 'academic-report' ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="academic-report-title">
          <div className="border-b border-slate-200 px-5 py-4"><h2 id="academic-report-title" className="text-lg font-semibold text-slate-900">{t('vicePresidentDashboard.reportsTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('vicePresidentDashboard.reportsDescription')}</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.name')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.role')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.department')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.finalScore')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.action')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => {
                  const performance = performanceByCandidate[String(candidate.academic_directorate_id)];
                  const completed = isPerformanceComplete(performance);
                  const role = ['academic_directorate', 'academic_director', 'directorate'].includes(String(candidate.role || '').toLowerCase()) ? t('vicePresidentDashboard.academicDirectorate') : t('vicePresidentDashboard.instructor');
                  return <tr key={candidate.academic_directorate_id}>
                    <td className="px-4 py-4 font-semibold text-slate-900">{candidate.full_name || candidate.email || '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{role}</td>
                    <td className="px-4 py-4 text-slate-700">{candidate.department_name || '—'}</td>
                    <td className="px-4 py-4">{completed ? <span className="font-bold text-blue-800">{Number(performance.totalScore).toFixed(2)}%</span> : <span className="text-slate-500">—</span>}</td>
                    <td className="px-4 py-4">{completed ? <button type="button" onClick={() => printPerformanceReport(candidate)} disabled={!performance} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><Printer size={15} />{t('vicePresidentDashboard.printReport')}</button> : <div className="flex flex-wrap items-center gap-2"><button type="button" disabled className="inline-flex items-center gap-2 rounded-md bg-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-500"><Printer size={15} />{t('vicePresidentDashboard.printReport')}</button><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{t('vicePresidentDashboard.pendingSubmissions')}</span></div>}</td>
                  </tr>;
                })}
                {!candidates.length && <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-500">{t('vicePresidentDashboard.noReportCandidates')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="academic-directorate-list-title">
          <div className="border-b border-slate-200 px-5 py-4"><h2 id="academic-directorate-list-title" className="text-lg font-semibold text-slate-900">{t('vicePresidentDashboard.evaluationsTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('vicePresidentDashboard.pointsNote')}</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.directorateInstructor')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.deadline')}</th><th className="px-4 py-3 font-semibold">{t('vicePresidentDashboard.action')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => {
                  const evaluated = isEvaluated(candidate);
                  const evaluatedScore = Number(candidate.weighted_score || 0).toFixed(2);
                  const directoratePerformance = performanceByCandidate[String(candidate.academic_directorate_id)];
                  return <tr key={candidate.academic_directorate_id}>
                    <td className="px-4 py-4"><p className="font-semibold text-slate-900">{candidate.full_name || candidate.email}</p><p className="mt-1 text-xs text-slate-500">{candidate.department_name || t('vicePresidentDashboard.departmentUnassigned')}{candidate.college_name ? ` · ${candidate.college_name}` : ''}</p></td>
                    <td className="px-4 py-4 text-slate-700">{formatDate(candidate.deadline, language)}{candidate.deadline ? <p className="mt-1 text-xs text-slate-500">{candidate.academic_year || '—'} · {candidate.semester || '—'}</p> : null}</td>
                    <td className="px-4 py-4">
                      {evaluated ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="font-semibold text-emerald-700">{t('vicePresidentDashboard.evaluated')} ({evaluatedScore}/30)</span>
                            <button type="button" onClick={() => openEvaluation(candidate, 'view')} className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">{t('vicePresidentDashboard.viewDetails')}</button>
                            <button type="button" onClick={() => openEvaluation(candidate, 'edit')} className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">{t('vicePresidentDashboard.editUpdate')}</button>
                          </div>
                          {directoratePerformance?.totalScore != null && (
                            <p className="text-xs font-semibold text-slate-600">
                              {t('vicePresidentDashboard.finalDirectoratePerformance')}: <span className="text-blue-800">{Number(directoratePerformance.totalScore).toFixed(2)}%</span>
                              {directoratePerformance.scoreScale?.isRescaled ? ` · ${t('vicePresidentDashboard.rescaledTo100')}` : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button type="button" onClick={() => openEvaluation(candidate, 'create')} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><span aria-hidden="true">★</span> {t('vicePresidentDashboard.evaluate')}</button>
                      )}
                    </td>
                  </tr>;
                })}
                {!candidates.length && <tr><td colSpan="3" className="px-4 py-10 text-center text-slate-500">{t('vicePresidentDashboard.noEvaluationCandidates')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {printReportData && <AcademicDirectorateReportPrint report={printReportData} logoUrl={landingContent.university_logo || landingContent.system_logo} vicePresidentName={user?.full_name || user?.name || 'Vice President'} vicePresidentEmail={user?.email || ''} />}
      <VicePresidentEvaluationModal
        open={Boolean(modalCandidate)}
        candidate={modalCandidate}
        mode={modalMode}
        isSubmitting={saving}
        errorMessage={modalError}
        onClose={closeEvaluation}
        onSubmit={submitEvaluation}
      />
    </section>
  );
};

export default VicePresidentDashboard;