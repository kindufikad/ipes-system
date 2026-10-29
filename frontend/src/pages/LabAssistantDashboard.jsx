import { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { labAssistantApi } from '../services/api';
import PeerEvaluationModal from '../components/PeerEvaluationModal';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';

const LabAssistantDashboard = () => {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [performance, setPerformance] = useState({
    studentScore: '0.0',
    deptHeadScore: '0.0',
    peerScore: '0.0',
    totalScore: '0.0',
    isComplete: false,
    statusBadge: 'Pending Complete Evaluation',
    strengths: [],
    improvements: [],
  });
  const [loading, setLoading] = useState(true);
  const [peerEvaluations, setPeerEvaluations] = useState([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerPublished, setPeerPublished] = useState(null);
  const [peerError, setPeerError] = useState('');
  const [selectedPeer, setSelectedPeer] = useState(null);
  const handleAiAction = (actionType) => {
    if (actionType === 'VIEW_LAB_ATTENDANCE') window.location.hash = 'evaluation';
    if (actionType === 'REVIEW_LAB_FEEDBACK') window.location.hash = 'peer';
  };

  // Determine active view from URL hash
  const activeView = location.hash.replace('#', '') || 'evaluation';

  const loadPeerEvaluations = async () => {
    if (!profile?.department_id) {
      setPeerEvaluations([]);
      setPeerPublished(false);
      setPeerError('Your department is not assigned yet. Please notify the Department Head to assign your department.');
      return;
    }

    setPeerLoading(true);
    setPeerError('');
    try {
      const data = await labAssistantApi.getPeerEvaluations();
      if (data?.isPublished) {
        setPeerEvaluations((data.evaluations || []).filter((item) => String(item.target_role || item.target_type || '').toLowerCase() === 'lab_assistant'));
        setPeerPublished(true);
      } else {
        setPeerEvaluations([]);
        setPeerPublished(false);
      }
    } catch (error) {
      console.error('Peer evaluations load failed:', error);
      setPeerError(error?.message || 'Unable to load peer evaluations.');
      setPeerPublished(false);
      setPeerEvaluations([]);
    } finally {
      setPeerLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.warn('No authentication token found');
          setLoading(false);
          return;
        }

        const headers = { Authorization: `Bearer ${token}` };

        let profileData = null;

        try {
          const userRes = await axios.get('/api/lab-assistant/profile', { headers });
          profileData = userRes?.data?.data || userRes?.data;
          const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
          setProfile(profileData || {
            first_name: 'Lab Assistant',
            last_name: '',
            employee_id: 'N/A',
            department_name: storedUser.department_name || storedUser.departmentName || 'N/A',
            department_id: storedUser.department_id || storedUser.departmentId || null,
          });
          if (profileData && !profileData.department_id && storedUser.department_id) {
            profileData = { ...profileData, department_id: storedUser.department_id, department_name: profileData.department_name || storedUser.department_name || 'N/A' };
            setProfile(profileData);
          }
        } catch (profileErr) {
          console.error("Profile fetch error:", profileErr.message);
          setProfile({
            first_name: 'Lab Assistant',
            last_name: '',
            employee_id: 'N/A',
            department_id: null,
            department_name: 'N/A'
          });
        }

        try {
          const perfRes = await axios.get('/api/lab-assistant/my-performance', { headers });
          const perfData = perfRes?.data?.performance || perfRes?.data || {};
          const departmentName = perfRes?.data?.department_name || profileData?.department_name || 'N/A';

          setProfile((currentProfile) => ({
            ...(currentProfile || {}),
            department_id: perfRes?.data?.department_id ?? profileData?.department_id ?? currentProfile?.department_id ?? null,
            department_name: departmentName,
            departmentName,
          }));

          const safeStudentScore = Number(perfData.student_score ?? perfData.studentScore ?? 0);
          const safeDeptHeadScore = Number(perfData.dept_head_score ?? perfData.deptHeadScore ?? 0);
          const safePeerScore = Number(perfData.peer_score ?? perfData.peerScore ?? 0);
          const hasAssignedCourses = perfData.has_assigned_courses ?? perfData.hasAssignedCourses ?? true;
          const weights = perfData.weights || perfRes?.data?.weights || {
            student: hasAssignedCourses ? 50 : 0,
            peer: hasAssignedCourses ? 20 : 40,
            deptHead: hasAssignedCourses ? 30 : 60,
          };
          const isComplete = perfData.isComplete === true || perfRes?.data?.isComplete === true;
          const safeTotalScore = isComplete
            ? Number(perfData.final_score ?? perfData.totalPerformance ?? perfData.totalScore ?? 0)
            : 0;
          const strengths = Array.isArray(perfData.strengths) ? perfData.strengths : (Array.isArray(perfRes?.data?.strengths) ? perfRes.data.strengths : []);
          const improvements = Array.isArray(perfData.improvements) ? perfData.improvements : (Array.isArray(perfRes?.data?.improvements) ? perfRes.data.improvements : []);

          setPerformance({
            studentScore: Number.isFinite(safeStudentScore) ? safeStudentScore.toFixed(1) : '0.0',
            deptHeadScore: Number.isFinite(safeDeptHeadScore) ? safeDeptHeadScore.toFixed(1) : '0.0',
            peerScore: Number.isFinite(safePeerScore) ? safePeerScore.toFixed(1) : '0.0',
            totalScore: Number.isFinite(safeTotalScore) ? safeTotalScore.toFixed(1) : '0.0',
            isComplete,
            hasAssignedCourses,
            weights,
            statusBadge: isComplete ? 'Completed' : (perfData.statusBadge || perfRes?.data?.statusBadge || 'Pending Complete Evaluation'),
            strengths,
            improvements,
          });
        } catch (perfErr) {
          console.error("Performance fetch error:", perfErr.message);
          setPerformance({
            studentScore: '0.0',
            deptHeadScore: '0.0',
            peerScore: '0.0',
            totalScore: '0.0',
            isComplete: false,
            hasAssignedCourses: true,
            weights: { student: 50, peer: 20, deptHead: 30 },
            statusBadge: 'Pending Complete Evaluation',
            strengths: [],
            improvements: [],
          });
        }
      } catch (err) {
        console.error("Dashboard initialization error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Load peer evaluations when peer view becomes active
  useEffect(() => {
    if (activeView === 'peer') {
      if (!profile?.department_id) {
        setPeerEvaluations([]);
        setPeerPublished(false);
        setPeerError('Your department is not assigned yet. Please notify the Department Head to assign your department.');
        return;
      }
      loadPeerEvaluations();
    }
  }, [activeView, profile?.department_id]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-sky-100 via-blue-100 to-sky-50 p-6 text-slate-900 shadow-lg border border-sky-200">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Mekdela Amba University</p>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl text-slate-900">Welcome, {profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : profile?.first_name || 'Lab Assistant'}</h1>
            <div className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-slate-800 shadow-sm">
              Department: {profile?.department_name || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <IPESAISmartInsights role="LAB_ASSISTANT" departmentId={profile?.department_id} userId={profile?.id || profile?.user_id} onActionClick={handleAiAction} />

      {activeView === 'peer' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Peer Evaluation</h2>
            {peerLoading ? (
              <p className="text-center text-gray-500">Loading peer evaluations...</p>
            ) : peerError ? (
              <p className="text-center text-red-600">{peerError}</p>
            ) : peerPublished === false ? (
              <p className="text-center text-gray-500">Peer evaluation is not currently published.</p>
            ) : peerEvaluations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Employee ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {peerEvaluations.map((item) => (
                      <tr key={item.id}>
                        {(() => {
                          const normalizedStatus = String(item.status || item.submission_status || '').toLowerCase();
                          const isComplete = normalizedStatus === 'completed' || normalizedStatus === 'submitted' || item.is_evaluated;
                          const scoreValue = item.score_percentage ?? item.total_score;
                          const score = Number(scoreValue);
                          const hasScore = isComplete && scoreValue !== null && scoreValue !== undefined && Number.isFinite(score);
                          return (
                            <>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.name || 'N/A'}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{item.employee_id || 'N/A'}</td>
                        <td className="px-4 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isComplete ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {isComplete ? 'Completed' : 'Pending'}
                            </span>
                            {hasScore && <span className="font-semibold text-gray-700">{score.toFixed(2)}%</span>}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm"><button type="button" onClick={() => setSelectedPeer(item)} className="font-semibold text-blue-600 hover:underline">{isComplete ? 'Edit Evaluation' : 'Evaluate'}</button></td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-500">No peer evaluations assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {selectedPeer && <PeerEvaluationModal
        open
        evaluation={{
          ...selectedPeer,
          instructor_name: selectedPeer.name,
          course_name: 'Academic and Research Assistant Peer Evaluation',
          department_name: selectedPeer.department_name || profile?.department_name,
          college_name: selectedPeer.college_name || profile?.college_name,
        }}
        onClose={() => setSelectedPeer(null)}
        mode={String(selectedPeer.status || selectedPeer.submission_status || '').toLowerCase() === 'completed' || String(selectedPeer.status || selectedPeer.submission_status || '').toLowerCase() === 'submitted' ? 'edit' : 'create'}
        evaluationRecord={String(selectedPeer.status || selectedPeer.submission_status || '').toLowerCase() === 'completed' || String(selectedPeer.status || selectedPeer.submission_status || '').toLowerCase() === 'submitted' ? selectedPeer : null}
        onSubmit={(payload) => labAssistantApi.evaluatePeer({
          evaluator_id: profile?.user_id || profile?.id,
          evaluated_id: selectedPeer.target_user_id || selectedPeer.id,
          target_role: selectedPeer.target_role || 'lab_assistant',
          ratings: payload.responses,
          strengths: payload.strengths,
          improvements: payload.suggestions,
          score: payload.score,
        })}
        onSubmitted={() => {
          void loadPeerEvaluations();
          setSelectedPeer(null);
        }}
      />}

      {activeView === 'evaluation' && (
        <div className="space-y-6">
          {loading ? (
            <div className="p-8 text-center text-gray-500 font-medium">Loading evaluation performance...</div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Total Weighted Evaluation Score</p>
                <h2 className={`text-5xl font-bold mt-3 ${performance.isComplete ? 'text-ieps-blue-700' : 'text-slate-500'}`}>{performance.isComplete ? `${performance.totalScore}%` : 'Pending Completion'}</h2>
                {!performance.isComplete && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{performance.hasAssignedCourses ? 'At least half of registered students, one peer, and the Department Head must submit evaluations.' : 'One peer and the Department Head must submit evaluations.'}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="bg-blue-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-blue-600">Student Evaluation</span>
                    <span className="bg-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded font-semibold">{performance.weights.student}% Weight</span>
                  </div>
                  <p className="text-4xl font-bold text-blue-600">{performance.hasAssignedCourses ? `${performance.studentScore}%` : 'N/A'}</p>
                </div>

                <div className="bg-amber-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-amber-600">Dept Head Evaluation</span>
                    <span className="bg-amber-200 text-amber-700 text-xs px-2.5 py-1 rounded font-semibold">{performance.weights.deptHead}% Weight</span>
                  </div>
                  <p className="text-4xl font-bold text-amber-600">{performance.deptHeadScore}%</p>
                </div>

                <div className="bg-purple-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-purple-600">Peer Evaluation</span>
                    <span className="bg-purple-200 text-purple-700 text-xs px-2.5 py-1 rounded font-semibold">{performance.weights.peer}% Weight</span>
                  </div>
                  <p className="text-4xl font-bold text-purple-600">{performance.peerScore}%</p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-6">
                  <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-emerald-800">Strengths &amp; Positive Highlights</h3><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">Strengths</span></div>
                  {performance.strengths.length ? <ul className="list-disc space-y-2 pl-5 text-sm text-emerald-950">{performance.strengths.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="text-sm text-emerald-900/70">No written strengths submitted yet.</p>}
                </section>
                <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-6">
                  <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-amber-900">Areas for Improvement (Weaknesses)</h3><span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">Focus Areas</span></div>
                  {performance.improvements.length ? <ul className="list-disc space-y-2 pl-5 text-sm text-amber-950">{performance.improvements.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="text-sm text-amber-900/70">No written areas for improvement submitted yet.</p>}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LabAssistantDashboard;