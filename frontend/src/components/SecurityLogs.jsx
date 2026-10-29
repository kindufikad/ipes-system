import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Ban,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  KeyRound,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  UnlockKeyhole,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';
import './SecurityLogs.css';

const PAGE_SIZE = 10;
const DEFAULT_LOCK_REASON = 'System temporarily locked by System Admin';

const formatDate = (value) => {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getSeverity = (entry) => {
  const status = Number(entry.statusCode || 0);
  if (status === 500) return 'CRITICAL';
  if (status >= 500) return 'ERROR';
  if (status >= 400) return 'WARN';
  if (/security|critical|blocked|failed/i.test(`${entry.category || ''} ${entry.action || ''}`)) return 'WARN';
  return 'INFO';
};

const getMethodClass = (method = '') => `soc-method soc-method--${String(method).toLowerCase()}`;
const getStatusClass = (status = 0) => Number(status) >= 500 ? 'soc-status soc-status--critical' : Number(status) >= 400 ? 'soc-status soc-status--warn' : 'soc-status soc-status--ok';

const SecurityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [failedLogins, setFailedLogins] = useState({ totalAttempts: 0, uniqueIps: 0, attempts: [], blockedIps: [] });
  const [controls, setControls] = useState({
    blockedIps: [],
    isSystemLocked: false,
    lockReason: DEFAULT_LOCK_REASON,
  });
  const [controlsLoaded, setControlsLoaded] = useState(false);
  const [lockReasonDraft, setLockReasonDraft] = useState(DEFAULT_LOCK_REASON);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isLive, setIsLive] = useState(true);
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'time', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState({ name: '', expiresInDays: 90, scopes: ['read:audit', 'read:health'] });
  const [revealedSecret, setRevealedSecret] = useState('');
  const loadDashboard = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.allSettled([
        adminApi.getSecurityLogs({ page: 1, limit: 100, dateRange: 'all' }),
        adminApi.getActiveSessions(),
        adminApi.getFailedLoginActivity(),
        adminApi.getSecurityControls(),
        adminApi.getSecurityApiKeys(),
      ]);
      const [logsResult, sessionsResult, failedResult, controlsResult, keysResult] = results;
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length === results.length) throw failures[0].reason;
      if (logsResult.status === 'fulfilled') {
        setLogs(Array.isArray(logsResult.value?.logs) ? logsResult.value.logs : []);
      }
      if (sessionsResult.status === 'fulfilled') setSessions(Array.isArray(sessionsResult.value) ? sessionsResult.value : []);
      if (failedResult.status === 'fulfilled') setFailedLogins(failedResult.value || { totalAttempts: 0, uniqueIps: 0, attempts: [], blockedIps: [] });
      if (controlsResult.status === 'fulfilled') {
        const value = controlsResult.value?.data || controlsResult.value || {};
        setControls({
          ...value,
          blockedIps: Array.isArray(value.blockedIps) ? value.blockedIps : [],
          isSystemLocked: Boolean(value.isSystemLocked),
          lockReason: value.lockReason || DEFAULT_LOCK_REASON,
        });
        if (!silent) setLockReasonDraft(value.lockReason || DEFAULT_LOCK_REASON);
        setControlsLoaded(true);
      } else {
        setControlsLoaded(false);
      }
      if (keysResult.status === 'fulfilled') setApiKeys(Array.isArray(keysResult.value) ? keysResult.value : []);
      if (failures.length) setError(`${failures.length} security data source${failures.length === 1 ? '' : 's'} could not be refreshed.`);
      else setError('');

      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      setError(loadError?.message || 'Unable to retrieve security operations data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!isLive) return undefined;
    const timer = window.setInterval(() => void loadDashboard(true), 15000);
    return () => window.clearInterval(timer);
  }, [isLive, loadDashboard]);

  const failedAttempts = useMemo(() => failedLogins.attempts || [], [failedLogins.attempts]);
  const blockedIps = useMemo(
    () => [...new Set([...(controls.blockedIps || []), ...(failedLogins.blockedIps || [])])].filter(Boolean),
    [controls.blockedIps, failedLogins.blockedIps]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLogs = logs.filter((entry) => {
    const matchesSeverity = severityFilter === 'ALL' || getSeverity(entry) === severityFilter;
    const matchesQuery = !normalizedQuery || [entry.user, entry.email, entry.action, entry.desc, entry.ip, entry.browser, entry.route, entry.method]
      .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    return matchesSeverity && matchesQuery;
  });
  const sortedLogs = [...filteredLogs].sort((left, right) => {
    const a = left[sort.key] ?? '';
    const b = right[sort.key] ?? '';
    const comparison = sort.key === 'time' ? new Date(a).getTime() - new Date(b).getTime() : String(a).localeCompare(String(b));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / PAGE_SIZE));
  const pagedLogs = sortedLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const requestConfirm = (action) => {
    setPendingAction(action);
    setConfirmChecked(false);
    setConfirmPhrase('');
  };

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    const requiredPhrase = pendingAction.phrase;
    if (!confirmChecked || (requiredPhrase && confirmPhrase !== requiredPhrase)) return;
    setBusy(true);
    try {
      switch (pendingAction.type) {
        case 'revoke-session': {
          await adminApi.revokeActiveSession(pendingAction.session.id);
          toast.success(`Session revoked for ${pendingAction.session.userName}.`);
          break;
        }
        case 'clear-logs': {
          await adminApi.clearSecurityLogs();
          setLogs([]);
          toast.success('Audit history cleared.');
          break;
        }
        case 'rotate-key': {
          const result = await adminApi.rotateSecurityApiKey(pendingAction.key.id, {
            name: pendingAction.key.name,
            scopes: pendingAction.key.scopes,
            expiresInDays: pendingAction.expiresInDays || 90,
          });
          setRevealedSecret(result.secret || '');
          toast.success('API key rotated. Copy the new secret now.');
          break;
        }
        case 'revoke-key': {
          await adminApi.revokeSecurityApiKey(pendingAction.key.id);
          toast.success('API key revoked.');
          break;
        }
        default:
          break;
      }
      setPendingAction(null);
      await loadDashboard(true);
    } catch (actionError) {
      toast.error(actionError?.message || 'Security action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleBlockIp = async (ipAddress, blocked) => {
    setBusy(true);
    try {
      if (blocked) await adminApi.updateBlockedIp(ipAddress, true);
      else await adminApi.deleteBlockedIp(ipAddress);
      toast.success(blocked ? `${ipAddress} blocked at the application edge.` : `${ipAddress} removed from the blocklist.`);
      await loadDashboard(true);
    } catch (actionError) {
      toast.error(actionError?.message || 'Unable to update IP blocklist.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSystemAccess = async () => {
    const lockReason = lockReasonDraft.trim();
    if (!lockReason) {
      toast.error('Enter a notification message before changing system access.');
      return;
    }
    setBusy(true);
    try {
      const result = await adminApi.toggleSystemAccessLock({
        isSystemLocked: !controls.isSystemLocked,
        lockReason,
      });
      const settings = result?.data || result;
      setControls((current) => ({
        ...current,
        isSystemLocked: Boolean(settings?.isSystemLocked),
        lockReason: settings?.lockReason || lockReason,
      }));
      setLockReasonDraft(settings?.lockReason || lockReason);
      toast.success(settings?.isSystemLocked ? 'System access locked.' : 'System access unlocked.');
    } catch (actionError) {
      toast.error(actionError?.message || 'Unable to update system access.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateKey = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await adminApi.createSecurityApiKey(keyDraft);
      setRevealedSecret(result.secret || '');
      setKeyDraft({ name: '', expiresInDays: 90, scopes: ['read:audit', 'read:health'] });
      toast.success('API key created. Copy its secret now; it will not be shown again.');
      await loadDashboard(true);
    } catch (actionError) {
      toast.error(actionError?.message || 'Unable to create API key.');
    } finally {
      setBusy(false);
    }
  };

  const toggleScope = (scope) => {
    setKeyDraft((current) => ({
      ...current,
      scopes: current.scopes.includes(scope) ? current.scopes.filter((item) => item !== scope) : [...current.scopes, scope],
    }));
  };

  const exportLogs = (format) => {
    const data = format === 'json'
      ? JSON.stringify(filteredLogs, null, 2)
      : [
        ['Timestamp', 'Severity', 'User', 'Action', 'IP', 'Method', 'Route', 'Status'],
        ...filteredLogs.map((entry) => [entry.time, getSeverity(entry), entry.user, entry.action, entry.ip, entry.method, entry.route, entry.statusCode]),
      ].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ipes-security-activity-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const sortBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ column }) => sort.key === column ? (sort.direction === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />) : null;

  return (
    <section className="soc-dashboard" aria-labelledby="soc-title">
      <header className="soc-header">
        <div>
          <p className="soc-eyebrow"><ShieldCheck size={15} /> SECURITY OPERATIONS CENTER</p>
          <h2 id="soc-title">Security &amp; Logs</h2>
          <p>Audit activity, authenticated sessions, API keys, and IP blocklist management.</p>
        </div>
        <div className="soc-header__actions">
          <span className={`soc-live-indicator ${isLive ? 'is-live' : ''}`}><span />{isLive ? 'Live monitoring' : 'Paused'}</span>
          <button type="button" className="soc-button soc-button--subtle" onClick={() => void loadDashboard(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'soc-spin' : ''} /> Refresh</button>
        </div>
      </header>

      {error && <div className="soc-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => void loadDashboard()}>Retry</button></div>}

      <section className={`soc-panel soc-access-control${controls.isSystemLocked ? ' is-locked' : ''}`} aria-labelledby="soc-access-control-title">
        <header className="soc-panel__heading">
          <div>
            <span className="soc-eyebrow">SYSTEM ACCESS CONTROL</span>
            <h3 id="soc-access-control-title">System Access Lock / Maintenance Mode</h3>
            <p>Restrict non-administrator sign-in and API access while keeping System Admin access available.</p>
          </div>
          <span className={`soc-access-status${controls.isSystemLocked ? ' is-locked' : ''}`} role="status">
            {controls.isSystemLocked ? 'Access locked' : 'Access open'}
          </span>
        </header>
        <div className="soc-access-control__body">
          <label className="soc-access-control__message">
            Lock notification message
            <input
              type="text"
              value={lockReasonDraft}
              maxLength={500}
              onChange={(event) => setLockReasonDraft(event.target.value)}
              placeholder={DEFAULT_LOCK_REASON}
            />
          </label>
          <button
            type="button"
            className={`soc-button ${controls.isSystemLocked ? 'soc-button--subtle' : 'soc-button--danger'}`}
            onClick={() => void handleToggleSystemAccess()}
            disabled={busy || loading || !controlsLoaded}
          >
            {controls.isSystemLocked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
            {controls.isSystemLocked ? 'Unlock System Access' : 'Lock System Access'}
          </button>
        </div>
      </section>

      <section className="soc-panel soc-audit-panel">
        <header className="soc-panel__heading soc-audit-heading">
          <div><span className="soc-eyebrow">AUDIT STREAM · {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Waiting for data'}</span><h3>Live activity log</h3><p>Streaming audit events from the server.</p></div>
          <div className="soc-audit-actions">
            <button type="button" className={`soc-button ${isLive ? 'soc-button--live' : 'soc-button--subtle'}`} onClick={() => setIsLive((current) => !current)}>{isLive ? <Square size={14} /> : <Play size={14} />}{isLive ? 'Pause feed' : 'Resume feed'}</button>
            <button type="button" className="soc-button soc-button--subtle" onClick={() => exportLogs('csv')}><Download size={14} />CSV</button>
            <button type="button" className="soc-button soc-button--subtle" onClick={() => exportLogs('json')}><Download size={14} />JSON</button>
            <button type="button" className="soc-button soc-button--danger" onClick={() => requestConfirm({ type: 'clear-logs', title: 'Clear audit history?', body: 'This permanently removes the current audit history.', phrase: 'CLEAR' })}><Trash2 size={14} />Clear</button>
          </div>
        </header>

        <div className="soc-audit-filters">
          <label className="soc-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search user, IP, action, route…" /></label>
          <label className="soc-select"><span>Severity</span><select value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(1); }}><option value="ALL">All severities</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option><option value="CRITICAL">CRITICAL</option></select></label>
        </div>

        <div className="soc-table-wrap">
          <table className="soc-table">
            <thead><tr>
              <th><button type="button" onClick={() => sortBy('time')}>Timestamp <SortIcon column="time" /></button></th>
              <th><button type="button" onClick={() => sortBy('user')}>Actor <SortIcon column="user" /></button></th>
              <th><button type="button" onClick={() => sortBy('action')}>Event <SortIcon column="action" /></button></th>
              <th>Request</th><th>Source IP</th><th><button type="button" onClick={() => sortBy('statusCode')}>Status <SortIcon column="statusCode" /></button></th><th>Severity</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7"><div className="soc-table-loading"><i /><i /><i /><i /></div></td></tr> : pagedLogs.length ? pagedLogs.map((entry) => {
                const severity = getSeverity(entry);
                return <tr key={entry.id}>
                  <td className="soc-nowrap">{formatDate(entry.time)}</td>
                  <td><strong>{entry.user || 'System'}</strong>{entry.email && <small>{entry.email}</small>}</td>
                  <td><strong>{entry.action || 'System event'}</strong><small>{entry.desc || '--'}</small></td>
                  <td>{entry.method ? <span className={getMethodClass(entry.method)}>{entry.method}</span> : '—'}<small className="soc-route">{entry.route || ''}</small></td>
                  <td className="soc-mono">{entry.ip || 'Unknown'}</td>
                  <td><span className={getStatusClass(entry.statusCode)}>{entry.statusCode || '—'}</span></td>
                  <td><span className={`soc-severity soc-severity--${severity.toLowerCase()}`}>{severity}</span></td>
                </tr>;
              }) : <tr><td colSpan="7"><div className="soc-table-empty"><CheckCircle2 size={21} /><strong>No matching activity</strong><span>Adjust the filters or wait for new events.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="soc-table-footer"><span>{sortedLogs.length} matching events · Page {page} of {totalPages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></footer>
      </section>

      <div className="soc-lower-grid">
        <section className="soc-panel">
          <header className="soc-panel__heading"><div><span className="soc-eyebrow">ACCESS CONTROL</span><h3>Active user sessions</h3><p>IP location is shown only when supplied by the request environment.</p></div><span className="soc-count">{sessions.length}</span></header>
          <div className="soc-session-list">
            {sessions.length ? sessions.map((session) => <article className="soc-session" key={session.id}>
              <div className="soc-session__identity"><span className="soc-session__avatar"><Users size={16} /></span><div><strong>{session.userName}</strong><span>{session.email} · {session.role}</span></div></div>
              <div className="soc-session__details"><span><b>IP</b>{session.ipAddress}</span><span><b>Device</b>{session.device}</span><span><b>Location</b>{session.location}</span><span><b>Activity</b>{formatDate(session.lastActivity)}</span></div>
              <button type="button" className="soc-button soc-button--danger" disabled={session.current} title={session.current ? 'Sign out to end this session' : 'Revoke session'} onClick={() => requestConfirm({ type: 'revoke-session', session, title: 'Revoke this session?', body: `This will invalidate ${session.userName}'s current access token.` })}><UnlockKeyhole size={14} />{session.current ? 'Current' : 'Revoke session'}</button>
            </article>) : <div className="soc-empty">{loading ? 'Loading sessions…' : 'No active sessions found.'}</div>}
          </div>
        </section>

        <section className="soc-panel soc-failed-panel">
          <header className="soc-panel__heading"><div><span className="soc-eyebrow">AUTHENTICATION RISK</span><h3>Failed logins &amp; IP controls</h3></div><span className="soc-count soc-count--warn">{failedLogins.totalAttempts || 0}</span></header>
          <p className="soc-panel__description">Failed sign-in events grouped by source address in the last 24 hours.</p>
          <div className="soc-ip-list">
            {failedAttempts.length ? failedAttempts.map((entry) => {
              const isBlocked = blockedIps.includes(entry.ipAddress);
              return <article key={entry.ipAddress} className="soc-ip-row"><div><strong>{entry.ipAddress}</strong><span>{entry.attempts} failed attempts · last {formatDate(entry.lastAttempt)}</span></div><button type="button" className={`soc-button ${isBlocked ? 'soc-button--subtle' : 'soc-button--danger'}`} disabled={busy || entry.ipAddress === 'unknown'} onClick={() => void handleBlockIp(entry.ipAddress, !isBlocked)}>{isBlocked ? <Check size={14} /> : <Ban size={14} />}{isBlocked ? 'Unblock' : 'Block IP'}</button></article>;
            }) : <div className="soc-empty"><CheckCircle2 size={19} />No failed login attempts in the last 24 hours.</div>}
          </div>
          {blockedIps.length > 0 && <div className="soc-blocked-summary"><strong>Blocked IP addresses</strong><div>{blockedIps.map((ip) => <button type="button" key={ip} onClick={() => void handleBlockIp(ip, false)} disabled={busy} title="Unblock IP">{ip}<X size={13} /></button>)}</div></div>}
        </section>
      </div>

      <section className="soc-panel soc-keys-panel">
        <header className="soc-panel__heading"><div><span className="soc-eyebrow">CREDENTIAL LIFECYCLE</span><h3>API keys &amp; service tokens</h3><p>Secrets are hashed at rest and shown only once after creation or rotation.</p></div><KeyRound size={20} /></header>
        <form className="soc-key-form" onSubmit={handleCreateKey}>
          <label>Key name<input value={keyDraft.name} maxLength={100} onChange={(event) => setKeyDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Reporting integration" required /></label>
          <label>Expires in<select value={keyDraft.expiresInDays} onChange={(event) => setKeyDraft((current) => ({ ...current, expiresInDays: Number(event.target.value) }))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option></select></label>
          <fieldset><legend>Scopes</legend>{[['read:audit', 'Read audit'], ['read:health', 'Read health'], ['write:users', 'Manage users'], ['write:evaluations', 'Manage evaluations']].map(([scope, label]) => <label key={scope}><input type="checkbox" checked={keyDraft.scopes.includes(scope)} onChange={() => toggleScope(scope)} />{label}</label>)}</fieldset>
          <button type="submit" className="soc-button soc-button--primary" disabled={busy || !keyDraft.scopes.length}><KeyRound size={15} />Generate API key</button>
        </form>
        {revealedSecret && <div className="soc-secret-reveal" role="status"><div><strong>Copy this secret now</strong><code>{revealedSecret}</code></div><button type="button" className="soc-button soc-button--subtle" onClick={() => { navigator.clipboard.writeText(revealedSecret).then(() => toast.success('API key copied.')).catch(() => toast.error('Clipboard access was denied.')); }}><Clipboard size={15} />Copy</button><button type="button" className="soc-icon-button" aria-label="Dismiss secret" onClick={() => setRevealedSecret('')}><X size={16} /></button></div>}
        <div className="soc-key-list">
          {apiKeys.length ? apiKeys.map((key) => <article key={key.id} className={`soc-key-row${key.revokedAt ? ' is-revoked' : ''}`}>
            <div className="soc-key-row__main"><span className="soc-key-icon"><KeyRound size={16} /></span><div><strong>{key.name}</strong><code>{key.prefix}</code><span>{(key.scopes || []).join(' · ')}</span></div></div>
            <div className="soc-key-row__meta"><span className={`soc-severity ${key.revokedAt ? 'soc-severity--critical' : 'soc-severity--info'}`}>{key.revokedAt ? 'REVOKED' : new Date(key.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE'}</span><span>Expires {formatDate(key.expiresAt)}</span></div>
            {!key.revokedAt && <div className="soc-key-row__actions"><button type="button" className="soc-button soc-button--subtle" disabled={busy} onClick={() => requestConfirm({ type: 'rotate-key', key, title: 'Rotate API key?', body: 'The current key will be revoked and a replacement secret will be generated.' })}><RotateCw size={14} />Rotate</button><button type="button" className="soc-button soc-button--danger" disabled={busy} onClick={() => requestConfirm({ type: 'revoke-key', key, title: 'Revoke API key?', body: `Revoke access for ${key.name}? This action cannot be undone.` })}><Trash2 size={14} />Revoke</button></div>}
          </article>) : <div className="soc-empty">No service keys have been created.</div>}
        </div>
      </section>

      <footer className="soc-footer"><span>Security data refreshes every 15 seconds while live.</span><span>Last refresh: {lastUpdated ? formatDate(lastUpdated) : '—'}</span></footer>

      {pendingAction && <div className="soc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingAction(null); }}>
        <section className="soc-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="soc-confirm-title">
          <span className="soc-confirm-modal__icon"><AlertTriangle size={22} /></span><h3 id="soc-confirm-title">{pendingAction.title}</h3><p>{pendingAction.body}</p>
          <label className="soc-confirm-checkbox"><input type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} />I understand this action affects access or stored security records.</label>
          {pendingAction.phrase && <label className="soc-confirm-phrase">Type <strong>{pendingAction.phrase}</strong> to continue<input autoComplete="off" value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} /></label>}
          <div className="soc-confirm-modal__actions"><button type="button" className="soc-button soc-button--subtle" onClick={() => setPendingAction(null)}>Cancel</button><button type="button" className="soc-button soc-button--danger" disabled={busy || !confirmChecked || (pendingAction.phrase && confirmPhrase !== pendingAction.phrase)} onClick={() => void runConfirmedAction()}>{busy ? 'Working…' : 'Confirm action'}</button></div>
        </section>
      </div>}
    </section>
  );
};

export default SecurityLogs;
