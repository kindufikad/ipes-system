import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useLocation } from 'react-router-dom';
import { deanApi } from '../services/api';
import DeanPerformanceView from '../components/DeanPerformanceView';
import DeanPeerEvaluationPanel from '../components/DeanPeerEvaluationPanel';
import DeanEvaluateDeptHeadPanel from '../components/DeanEvaluateDeptHeadPanel';
import DeanEvaluationTrackingPanel from '../components/DeanEvaluationTrackingPanel';
import HierarchicalReportsView from '../components/HierarchicalReportsView';
import PublishEvaluation from './PublishEvaluation';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import IPESAISmartInsights from '../components/ai/IPESAISmartInsights';

const metricCards = [
  { key: 'departmentsCount', label: 'Departments in College', icon: Building2 },
  { key: 'pendingDeptHeadEvals', label: 'Pending Dept Head Evals', icon: ClipboardCheck },
  { key: 'completedEvals', label: 'Completed Evaluations', icon: CheckCircle2 },
];

const CollegeAnalyticsView = ({ analytics }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-bold text-slate-900">College Analytics</h2>
    <div className="mt-6 h-[26rem]">
      {analytics.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics} margin={{ top: 24, right: 20, left: 0, bottom: 64 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="department" angle={analytics.length > 3 ? -30 : 0} textAnchor={analytics.length > 3 ? 'end' : 'middle'} height={analytics.length > 3 ? 80 : 40} tick={{ fill: '#475569', fontSize: 11 }} interval={0} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: '#475569', fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Average Score']} />
            <Bar dataKey="averageScore" fill="#2563eb" radius={[6, 6, 0, 0]}>
              <LabelList dataKey="averageScore" position="top" formatter={(value) => `${Number(value).toFixed(1)}%`} fill="#1e293b" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No department analytics are available yet.</div>}
    </div>
  </section>
);

const FacultyPerformanceView = ({ faculty, facultyFilter, setFacultyFilter }) => {
  const visibleFaculty = faculty.filter((row) => `${row.name} ${row.department}`.toLowerCase().includes(facultyFilter.toLowerCase()));
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">Faculty Performance</h2><p className="mt-1 text-sm text-slate-500">{visibleFaculty.length} of {faculty.length} instructors across your college.</p></div><input aria-label="Filter faculty" value={facultyFilter} placeholder="Filter by name or department" onChange={(event) => setFacultyFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /></div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Instructor</th><th className="px-3 py-3">Department</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleFaculty.map((row, index) => <tr key={`${row.instructorId}-${index}`}><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3">{row.department}</td><td className="px-3 py-3">{row.score}%</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'Good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></td></tr>)}</tbody></table></div></section>;
};

const CollegeDeanDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [reports, setReports] = useState([]);
  const [facultyFilter, setFacultyFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const hashTab = { 'evaluate-heads': 'evaluate' }[location.hash.replace('#', '')] || location.hash.replace('#', '') || 'overview';
    setActiveTab(['overview', 'evaluate', 'publish-evaluation', 'evaluation-tracking', 'peer-evaluation', 'analytics', 'faculty', 'reports', 'my-performance'].includes(hashTab) ? hashTab : 'overview');
  }, [location.hash]);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, departmentAnalytics, facultyPerformance, reportRows] = await Promise.all([
        deanApi.getOverviewStats(),
        deanApi.getDepartmentAnalytics(),
        deanApi.getFacultyPerformance(),
        deanApi.getReports(),
      ]);
      setStats(overview || {});
      setAnalytics(Array.isArray(departmentAnalytics) ? departmentAnalytics : []);
      setFaculty(Array.isArray(facultyPerformance) ? facultyPerformance : []);
      setReports(Array.isArray(reportRows) ? reportRows : []);
    } catch (loadError) {
      setStats({ departmentsCount: 0, pendingDeptHeadEvals: 0, completedEvals: 0 });
      setAnalytics([]);
      setFaculty([]);
      setReports([]);
      setError(loadError?.message || 'Unable to load college dean dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOverview(); }, []);

  const handleAiAction = (actionType) => {
    if (actionType === 'COMPARE_DEPARTMENTS') setActiveTab('analytics');
    if (actionType === 'BUILD_ACADEMIC_SUPPORT_PLAN') setActiveTab('reports');
    if (actionType === 'VIEW_PENDING' || actionType === 'VIEW_DEPARTMENT_PENDING') setActiveTab('evaluation-tracking');
  };

  return (
    <section className="space-y-6" aria-labelledby="dean-dashboard-title">
      {activeTab === 'overview' ? <header className="overflow-hidden rounded-3xl border border-blue-100 bg-blue-50 px-6 py-7 sm:px-8 sm:py-9">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Mekdela Amba University</p>
        <h1 id="dean-dashboard-title" className="mt-3 text-3xl font-bold tracking-tight text-blue-950 sm:text-4xl">Welcome, {user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'College Dean'}</h1>
        <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm">College Dean</span><span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800">College-level access</span></div>
      </header> : null}

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading college data...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <IPESAISmartInsights role="DEAN" departmentId={user?.department_id} userId={user?.id} onActionClick={handleAiAction} />

      {!loading && activeTab === 'overview' ? <>
        <div className="grid gap-4 md:grid-cols-3">{metricCards.map(({ key, label, icon: Icon }) => <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><p className="text-sm font-medium text-slate-500">{label}</p><span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon className="h-5 w-5" /></span></div><p className="mt-5 text-3xl font-bold text-slate-950">{stats[key] ?? 0}</p></article>)}</div>
      </> : null}

      {!loading && activeTab === 'evaluate' ? <DeanEvaluateDeptHeadPanel /> : null}
      {!loading && activeTab === 'publish-evaluation' ? <PublishEvaluation departmentId={user?.department_id || user?.departmentId || user?.department} role={user?.role} /> : null}
      {!loading && activeTab === 'evaluation-tracking' ? <DeanEvaluationTrackingPanel /> : null}
      {!loading && activeTab === 'peer-evaluation' ? <DeanPeerEvaluationPanel /> : null}
      {!loading && activeTab === 'analytics' ? <CollegeAnalyticsView analytics={analytics} /> : null}
      {!loading && activeTab === 'faculty' ? <FacultyPerformanceView faculty={faculty} facultyFilter={facultyFilter} setFacultyFilter={setFacultyFilter} /> : null}
      {!loading && activeTab === 'reports' ? <HierarchicalReportsView title="College Reports" description="Export authorized evaluation records for Department Heads in your college." rows={reports} currentUser={user} targetLabel="Department" /> : null}
      {!loading && activeTab === 'my-performance' ? <DeanPerformanceView /> : null}
    </section>
  );
};

export default CollegeDeanDashboard;
