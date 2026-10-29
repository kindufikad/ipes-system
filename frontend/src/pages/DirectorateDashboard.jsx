import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import BackButton from '../components/BackButton';
import { directorateApi } from '../services/api';
import DirectorateEvaluationTrackingPanel from '../components/DirectorateEvaluationTrackingPanel';
import DirectoratePeerEvaluationPanel from '../components/DirectoratePeerEvaluationPanel';
import MyPerformancePanel from '../components/MyPerformancePanel';
import HierarchicalReportsView from '../components/HierarchicalReportsView';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';
import { formatEvaluationDeadline } from '../utils/formatEvaluationDeadline';
const metricCards = [
  { key: 'totalColleges', label: 'Total Colleges', icon: Building2 },
  { key: 'pendingDeans', label: 'Pending Dean Evaluations', icon: ClipboardCheck },
  { key: 'completedDeans', label: 'Completed Evaluations', icon: CheckCircle2 },
];
const criteria = ['Leadership and institutional management', 'Academic quality assurance', 'Communication and stakeholder engagement', 'Planning, accountability, and reporting', 'Support for departments and faculty'];
const formatWeightedDeanScore = (score) => (Math.max(0, Number(score) || 0) * 0.3).toFixed(1);
const formatDeanDeadline = (value, autoLock = true) => {
  if (!value) return 'No active deadline';
  const deadlineDate = new Date(value);
  if (!Number.isFinite(deadlineDate.getTime())) return 'No active deadline';
  const dateText = formatEvaluationDeadline(value, 'en-US');
  const daysRemaining = Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000);
  const lockEnabled = autoLock === undefined || Number(autoLock) !== 0;
  const status = daysRemaining < 0
    ? lockEnabled ? 'Expired' : 'Open (auto-lock off)'
    : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
  return `${dateText} (${status})`;
};

const InstitutionalAnalyticsChart = ({ analytics }) => {
  const chartData = analytics.map((row) => ({
    ...row,
    college_name: row.college_name || 'College',
    performance: Math.max(0, Math.min(100, Number(row.performance) || 0)),
  }));
  return <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Institutional Analytics</h2><p className="mt-1 text-sm text-slate-500">College-level performance comparison.</p><div className="mt-6 h-[28rem]">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 24, right: 24, left: 4, bottom: 72 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="college_name" interval={0} angle={chartData.length > 3 ? -30 : 0} textAnchor={chartData.length > 3 ? 'end' : 'middle'} height={chartData.length > 3 ? 80 : 40} tick={{ fill: '#475569', fontSize: 11 }} /><YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: '#475569', fontSize: 11 }} /><Tooltip labelFormatter={(label) => label} formatter={(value) => [`${value}%`, 'Performance']} /><Bar dataKey="performance" fill="#2563eb" radius={[6, 6, 0, 0]}><LabelList dataKey="performance" position="top" formatter={(value) => `${value}%`} fill="#1e293b" /></Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No institutional performance data is available.</div>}</div></section>;
};

const DeanEvaluationTable = ({ deans, onSelect }) => {
  const [sort, setSort] = useState({ key: 'college_name', direction: 'asc' });
  const sortedDeans = [...deans].sort((left, right) => {
    const leftValue = String(left[sort.key] || '').toLowerCase();
    const rightValue = String(right[sort.key] || '').toLowerCase();
    return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * (sort.direction === 'asc' ? 1 : -1);
  });
  const sortBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const isSubmitted = (dean) => ['submitted', 'completed', 'approved'].includes(String(dean.evaluation_status || dean.status || '').toLowerCase()) || dean.evaluation_id;

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Evaluate College Deans</h2><p className="mt-1 text-sm text-slate-500">Select a Dean to begin the evaluation.</p><div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{[['full_name', 'DEAN NAME'], ['college_name', 'COLLEGE'], ['deadline', 'DEADLINE'], ['evaluation_status', 'STATUS']].map(([key, label]) => <th key={key} className="px-4 py-3"><button type="button" onClick={() => sortBy(key)} className="font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-700">{label} {sort.key === key ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</button></th>)}<th className="px-4 py-3 font-semibold uppercase tracking-wide text-slate-500">ACTION</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedDeans.length ? sortedDeans.map((dean) => { const submitted = isSubmitted(dean); return <tr key={dean.deanId}><td className="px-4 py-4 font-medium text-slate-900">{dean.full_name || dean.name || dean.email}</td><td className="px-4 py-4 text-slate-600">{dean.college_name || dean.college || '-'}</td><td className="px-4 py-4 text-slate-600">{formatDeanDeadline(dean.deadline, dean.deadline_auto_lock)}</td><td className="px-4 py-4">{submitted ? <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓ Evaluated ({formatWeightedDeanScore(dean.score)}/30)</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Pending</span>}</td><td className="px-4 py-4">{submitted ? <div className="flex gap-3"><button type="button" onClick={() => onSelect(dean, 'view')} className="text-sm font-semibold text-blue-700 underline hover:text-blue-900">View Details</button><button type="button" onClick={() => onSelect(dean, 'edit')} className="text-sm font-semibold text-blue-700 underline hover:text-blue-900">Edit</button></div> : <button type="button" onClick={() => onSelect(dean, 'create')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">★ Evaluate</button>}</td></tr>; }) : <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No College Deans found.</td></tr>}</tbody></table></div></section>;
};

const EvaluateDeansView = ({ deans, onSubmit }) => {
  const [selected, setSelected] = useState(null);
  const [ratings, setRatings] = useState({});
  const [formData, setFormData] = useState({ strengths: '', weaknesses: '' });
  if (!selected) return <DeanEvaluationTable deans={deans} onSelect={(dean) => { setSelected(dean); setRatings({}); setFormData({ strengths: '', weaknesses: '' }); }} />;
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">College Dean Evaluation</p><h2 className="mt-2 text-xl font-bold">{selected.full_name}</h2><p className="text-sm text-slate-500">{selected.college_name}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-2 text-sm">Back to list</button></div><div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><strong>Instructions:</strong> Rate every criterion from 1 (Poor) to 5 (Excellent).</div><form onSubmit={(event) => { event.preventDefault(); onSubmit({ deanId: selected.deanId, ratings, ...formData }); setSelected(null); }} className="space-y-5">{criteria.map((criterion, index) => <div key={criterion} className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-medium">{index + 1}. {criterion}</p><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" onClick={() => setRatings((current) => ({ ...current, [index]: rating }))} className={`h-10 w-10 rounded-full font-bold ${ratings[index] === rating ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{rating}</button>)}</div></div>)}<label className="block text-sm font-medium">Strengths / Key Achievements<textarea rows="3" value={formData.strengths} onChange={(event) => setFormData((current) => ({ ...current, strengths: event.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-3" /></label><label className="block text-sm font-medium">Areas for Improvement / Growth Opportunities<textarea rows="3" value={formData.weaknesses} onChange={(event) => setFormData((current) => ({ ...current, weaknesses: event.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-3" /></label><button type="submit" disabled={Object.keys(ratings).length !== criteria.length} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Submit Evaluation</button></form></section>;
};

  const DirectorateDashboard = () => {
  const { user } = useAuth(); const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview'); const [stats, setStats] = useState({}); const [deans, setDeans] = useState([]); const [reports, setReports] = useState([]); const [analytics, setAnalytics] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  
  useEffect(() => { const hash = location.hash.replace('#', '') || 'overview'; setActiveTab(['overview', 'evaluate-deans', 'peer-evaluation', 'evaluation-tracking', 'my-performance', 'analytics', 'reports'].includes(hash) ? hash : 'overview'); }, [location.hash]);
  const loadData = async () => { setLoading(true); setError(''); try { const [overview, deanRows, analyticsRows, reportRows] = await Promise.all([directorateApi.getOverviewStats(), directorateApi.getDeans(), directorateApi.getAnalytics(), directorateApi.getReports()]); setStats(overview || {}); setDeans(Array.isArray(deanRows) ? deanRows : []); setReports(Array.isArray(reportRows) ? reportRows : []); setAnalytics(Array.isArray(analyticsRows) ? analyticsRows : []); } catch (loadError) { setStats({ totalColleges: 0, pendingDeans: 0, completedDeans: 0 }); setDeans([]); setReports([]); setAnalytics([]); setError(loadError?.message || 'Unable to load Directorate data.'); } finally { setLoading(false); } };
  useEffect(() => { void loadData(); }, []);
  const handleAiAction = (actionType) => { if (actionType === 'VIEW_QA_COMPLIANCE' || actionType === 'VIEW_PENDING') setActiveTab('evaluation-tracking'); if (actionType === 'GENERATE_QA_REPORT') setActiveTab('reports'); };
  const submitEvaluation = async (payload) => { try { await directorateApi.evaluateDean(payload); setMessage('College Dean evaluation submitted successfully.'); await loadData(); } catch (submitError) { setError(submitError?.message || 'Unable to submit evaluation.'); } };
  if (activeTab === 'analytics') return <section className="space-y-6"><BackButton /><InstitutionalAnalyticsChart analytics={analytics} /></section>;
    const renderView = () => { if (loading) return <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Loading Directorate data...</div>; if (activeTab === 'evaluate-deans') return <EvaluateDeansView deans={deans} onSubmit={submitEvaluation} />; if (activeTab === 'peer-evaluation') return <DirectoratePeerEvaluationPanel />; if (activeTab === 'evaluation-tracking') return <DirectorateEvaluationTrackingPanel />; if (activeTab === 'my-performance') return <MyPerformancePanel />; if (activeTab === 'analytics') return <InstitutionalAnalyticsChart analytics={analytics} />; if (activeTab === 'reports') return <HierarchicalReportsView title="Executive Reports" description="Export authorized evaluation records for College Deans across the university." rows={reports} currentUser={user} targetLabel="College" />; return <><header className="rounded-3xl border border-blue-100 bg-blue-50 px-6 py-7"><p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Mekdela Amba University</p><h1 className="mt-3 text-3xl font-bold text-blue-950">Welcome, {user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'Academic Directorate'}</h1><p className="mt-2 text-sm text-blue-800">Institution-wide evaluation oversight and cycle control.</p></header><div className="grid gap-4 md:grid-cols-3">{metricCards.map(({ key, label, icon: Icon }) => <article key={key} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex justify-between"><p className="text-sm text-slate-500">{label}</p><Icon className="text-blue-600" /></div><p className="mt-5 text-3xl font-bold">{stats[key] || 0}</p></article>)}</div></>; };
  return <section className="space-y-6" aria-labelledby="directorate-dashboard-title"><BackButton />{error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}{message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}<IPESAISmartInsights role="ACADEMIC_DIRECTOR" userId={user?.id} departmentId={user?.department_id} onActionClick={handleAiAction} />{renderView()}</section>;
};

export default DirectorateDashboard;
