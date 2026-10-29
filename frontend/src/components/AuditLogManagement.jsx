import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Download, LockKeyhole, RefreshCw, Search, ShieldCheck, Trash2, UnlockKeyhole, UsersRound } from 'lucide-react';
import { adminApi } from '../services/api';

const formatTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatRole = (role) => String(role || 'Legacy / unknown').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const getStatusClasses = (status) => {
  if (status === 'SUCCESS') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (status === 'FAILED') return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  if (status === 'WARNING') return 'bg-amber-50 text-amber-800 ring-amber-600/20';
  return 'bg-slate-100 text-slate-600 ring-slate-500/20';
};

export default function AuditLogManagement() {
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState('7d');
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [capturedEvents, setCapturedEvents] = useState(null);
  const [database, setDatabase] = useState(null);
  const [retentionDays, setRetentionDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadLogs = useCallback(async (pageToLoad = page) => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getSecurityLogs({ search: query, dateRange, category, page: pageToLoad, limit: pageSize });
      setLogs(Array.isArray(response?.logs) ? response.logs : []);
      setTotalCount(Number(response?.totalCount || 0));
      setCapturedEvents(Number(response?.capturedEvents || 0));
      setDatabase(response?.database || null);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [category, dateRange, page, pageSize, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs, query]);

  const filterParams = { search: query, dateRange, category };

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const file = await adminApi.exportSecurityLogs(filterParams);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ipes-security-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to export audit logs.');
    } finally {
      setExporting(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all audit logs? This permanent action cannot be undone.')) return;
    setClearing(true);
    setError('');
    setMessage('');
    try {
      const response = await adminApi.clearSecurityLogs();
      setMessage(`${Number(response?.deleted || 0)} audit event(s) cleared.`);
      setPage(1);
      await loadLogs(1);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to clear audit logs.');
    } finally {
      setClearing(false);
    }
  };

  const handleToggleSystemLock = async () => {
    const enabled = !database?.systemLockEnabled;
    const confirmation = enabled
      ? 'Enable the global system lock? Non-administrator users will be unable to sign in.'
      : 'Disable the global system lock and restore user sign-in?';
    if (!window.confirm(confirmation)) return;
    setLockSaving(true);
    setError('');
    try {
      const response = await adminApi.updateSystemLock(enabled);
      setDatabase((current) => ({ ...current, systemLockEnabled: Boolean(response?.enabled) }));
      setMessage(response?.message || `Global system lock ${enabled ? 'enabled' : 'disabled'}.`);
      await loadLogs();
    } catch (requestError) {
      setError(requestError?.message || 'Unable to update the global system lock.');
    } finally {
      setLockSaving(false);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm(`Delete audit events older than ${retentionDays} days? This cannot be undone.`)) return;
    setCleaning(true);
    setError('');
    setMessage('');
    try {
      const response = await adminApi.cleanupSecurityLogs(retentionDays);
      setMessage(`${Number(response?.deleted || 0)} audit event(s) removed.`);
      setPage(1);
      await loadLogs(1);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to clean up audit logs.');
    } finally {
      setCleaning(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const configuredScore = database?.securityScore;
  const score = configuredScore === null || configuredScore === undefined || configuredScore === ''
    ? null
    : Number.isFinite(Number(configuredScore)) ? Number(configuredScore) : null;
  const scoreLabel = score === null ? 'Not configured' : score >= 80 ? 'Protection healthy' : 'Review recommended';

  return (
    <section className="min-h-[calc(100vh-4rem)] min-w-0 space-y-5">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Security control plane</p>
          <h2 className="text-2xl font-semibold text-slate-950">Security &amp; System Logs</h2>
          <p className="mt-1 text-sm text-slate-500">Audit authentication, administrative actions, and system changes.</p>
        </div>
        <button type="button" onClick={() => void loadLogs()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </header>

      {error ? <div role="alert" className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={16} />{error}</div> : null}
      {message ? <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Security score</p>
          <div className="mt-2 flex items-center gap-3"><ShieldCheck className={`h-6 w-6 shrink-0 ${score !== null && score >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} /><span className="text-2xl font-semibold text-slate-950">{score === null ? '--' : `${score} / 100`}</span></div>
          <p className={`mt-1 text-xs ${score !== null && score >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>{scoreLabel}</p>
        </article>
        <article className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Active connections</p>
          <div className="mt-2 flex items-center gap-3"><UsersRound className="h-6 w-6 shrink-0 text-blue-700" /><span className="text-2xl font-semibold text-slate-950">{database?.connections ?? '--'}</span></div>
          <p className="mt-1 text-xs text-slate-500">Live database connections</p>
        </article>
        <article className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Captured events</p>
          <div className="mt-2 flex items-center gap-3"><Activity className="h-6 w-6 shrink-0 text-cyan-700" /><span className="text-2xl font-semibold text-slate-950">{capturedEvents === null ? '--' : capturedEvents.toLocaleString()}</span></div>
          <p className="mt-1 text-xs text-slate-500">Persisted audit records</p>
        </article>
        <article className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Global system lock</p>
          <div className="mt-2 flex min-h-8 items-center gap-2 text-sm font-semibold">
            {database?.systemLockEnabled ? <LockKeyhole className="h-5 w-5 text-amber-700" /> : <UnlockKeyhole className="h-5 w-5 text-emerald-700" />}
            <span className={database?.systemLockEnabled ? 'text-amber-800' : database ? 'text-emerald-800' : 'text-slate-500'}>{database ? (database.systemLockEnabled ? 'Enabled' : 'Disabled') : 'Loading status'}</span>
          </div>
          <button type="button" onClick={() => void handleToggleSystemLock()} disabled={lockSaving || !database} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            {database?.systemLockEnabled ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}{lockSaving ? 'Updating...' : database?.systemLockEnabled ? 'Disable lock' : 'Enable maintenance lock'}
          </button>
        </article>
      </div>

      <section className="space-y-4 border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto_auto]">
          <label className="relative block min-w-0">
            <span className="sr-only">Search audit logs</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search email, user, event, or IP" className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by date range</span>
            <select value={dateRange} onChange={(event) => { setDateRange(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
              <option value="today">Today</option><option value="7d">Last 7 days</option><option value="all">All time</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by category</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
              <option value="ALL">All categories</option><option value="authentication">Authentication</option><option value="course_assignment">Course assignment</option><option value="system_settings">System settings</option><option value="security_alert">Security alert</option><option value="data_modification">Other data changes</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600"><CalendarClock size={16} /> Retention <select value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 font-semibold text-slate-900"><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option></select></label>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => void handleExport()} disabled={exporting} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Download size={16} />{exporting ? 'Exporting...' : 'Export CSV'}</button>
            <button type="button" onClick={() => void handleCleanup()} disabled={cleaning} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"><CalendarClock size={16} />{cleaning ? 'Cleaning...' : 'Delete older logs'}</button>
            <button type="button" onClick={() => void handleClearLogs()} disabled={clearing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"><Trash2 size={16} />{clearing ? 'Clearing...' : 'Clear logs'}</button>
          </div>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden border border-slate-200 bg-white shadow-sm" aria-label="System audit events">
        <div className="touch-pan-x overscroll-x-contain overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Action / Event</th><th className="px-4 py-3">Target details</th><th className="px-4 py-3">IP address</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-500">Loading audit events...</td></tr> : logs.length ? logs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatTime(log.time)}</td>
                  <td className="max-w-56 px-4 py-3"><p className="font-medium text-slate-900">{log.user || 'System'}</p>{log.email ? <p className="mt-0.5 break-all text-xs text-slate-500">{log.email}</p> : null}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatRole(log.role)}</td>
                  <td className="max-w-80 px-4 py-3"><p className="font-semibold text-slate-900">{log.action || 'System event'}</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{log.desc || '--'}</p></td>
                  <td className="max-w-64 px-4 py-3 text-xs text-slate-600">{log.target || '--'}{log.route ? <p className="mt-1 font-mono text-[11px] text-slate-400">{log.method} {log.route}</p> : null}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{log.ip || 'N/A'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusClasses(log.status)}`}>{log.status === 'SUCCESS' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{log.statusCode || '—'} {log.status}</span></td>
                </tr>
              )) : <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-500">No audit events match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {totalCount ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} matching events</p>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <label className="flex items-center gap-2">Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="min-h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <span className="whitespace-nowrap text-xs">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="min-h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </footer>
      </section>
    </section>
  );
}
