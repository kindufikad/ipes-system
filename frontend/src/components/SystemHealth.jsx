import { Database, RefreshCw } from 'lucide-react';

const formatMetricPercent = (value, unavailable = '--') => {
  if (value === null || value === undefined || value === '') return unavailable;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)}%` : unavailable;
};

const formatUptime = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const SystemHealth = ({
  systemHealth,
  dbHealthMetrics,
  loading,
  error,
  onRefresh,
  backuping,
  onTriggerBackup,
  backupRetentionDays,
  onBackupRetentionChange,
  backupRetentionSaving,
  onSaveBackupRetention,
  t,
}) => {
  const diskPercent = systemHealth?.generatedAt
    && systemHealth?.disk?.available !== false
    && systemHealth?.disk?.percentUsed !== null
    ? Number(systemHealth.disk.percentUsed)
    : null;
  const memoryPercent = systemHealth?.generatedAt
    ? Number(systemHealth?.memory?.percentUsed)
    : null;
  const lastBackup = systemHealth?.database?.lastBackup
    || (dbHealthMetrics.lastBackup !== '--' ? dbHealthMetrics.lastBackup : null);
  const parsedLastBackup = lastBackup ? new Date(lastBackup) : null;
  const lastBackupLabel = parsedLastBackup && !Number.isNaN(parsedLastBackup.getTime())
    ? parsedLastBackup.toLocaleString()
    : 'No backup yet';
  const healthAlerts = Array.isArray(systemHealth?.alerts) ? systemHealth.alerts : [];
  const visibleHealthAlerts = error
    ? [{ level: 'warning', title: 'Health data may be stale', detail: error }, ...healthAlerts]
    : healthAlerts.length
      ? healthAlerts
      : systemHealth?.generatedAt
        ? [{ level: 'healthy', title: 'All systems operational', detail: 'No critical issues detected.' }]
        : [{ level: 'warning', title: 'Waiting for health data', detail: 'The first server health snapshot is being collected.' }];
  const progressWidth = (value) => `${Math.min(100, Math.max(0, Number(value) || 0))}%`;

  return (
    <section className="space-y-8" aria-labelledby="system-health-title">
      <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="text-center">
          <p id="system-health-title" className="text-xs uppercase tracking-[0.2em] text-blue-600 font-semibold">
            {t('systemHealthTitle', 'System Health', 'የስርዓት ጤና')}
          </p>
          <p className="mt-4 text-4xl font-bold text-slate-900">{systemHealth?.uptime?.formatted || formatUptime(dbHealthMetrics.uptimeSeconds)}</p>
          <p className="text-slate-500 text-sm mt-2">{t('uptimeThisWeek', 'server uptime', 'የአገልጋዩ የስርዓት ጊዜ')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {systemHealth?.generatedAt ? `Updated ${new Date(systemHealth.generatedAt).toLocaleTimeString()}` : 'Waiting for first health snapshot'}
          </p>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-34px_rgba(37,99,235,0.24)]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t('systemHealth', 'System Health', 'የስርዓት ጤና')}</h3>
            <p className="text-slate-600">{t('systemHealthDesc', 'Monitor system performance, resources, and status.', 'የስርዓት አፈጻጸም፣ ሀብቶች እና ሁኔታ ተከታተል')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onTriggerBackup} disabled={backuping} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Database size={18} /> {backuping ? 'Backing up...' : 'Trigger Backup'}
            </button>
            <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70" disabled={loading}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">Server Resources &amp; Backup</h4>
              <span className="text-right text-xs font-medium text-blue-700">Last Backup: {lastBackupLabel}</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Server Volume Usage</span>
                  <span className="font-semibold text-slate-900">{diskPercent === null ? 'Unavailable' : formatMetricPercent(diskPercent, 'Unavailable')}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: progressWidth(diskPercent) }} />
                </div>
                {systemHealth?.disk?.available && <p className="mt-1 text-xs text-slate-500">{systemHealth.disk.usedGb} GB used of {systemHealth.disk.totalGb} GB</p>}
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Memory Usage</span>
                  <span className="font-semibold text-slate-900">{formatMetricPercent(memoryPercent)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all" style={{ width: progressWidth(memoryPercent) }} />
                </div>
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Backup Retention</span>
                  <span className="font-semibold text-slate-900">{backupRetentionDays} days</span>
                </div>
                <input type="range" min="7" max="90" value={backupRetentionDays} onChange={onBackupRetentionChange} className="w-full" />
                <div className="mt-2 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <p className="text-xs text-slate-500">Expired generated backups are removed after the next successful backup.</p>
                  <button type="button" onClick={onSaveBackupRetention} disabled={backupRetentionSaving} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50">
                    {backupRetentionSaving ? 'Saving...' : 'Save policy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
              <h4 className="mb-4 font-semibold text-slate-900">API Performance</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-600">Response Time</span><span className="font-semibold text-slate-900">{Number(systemHealth?.apiPerformance?.averageResponseTimeMs ?? 0).toFixed(1)}ms</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600">Request Rate</span><span className="font-semibold text-slate-900">{Number(systemHealth?.apiPerformance?.requestsPerMinute || 0).toLocaleString()}/min</span></div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Error Rate</span>
                  <span className={`font-semibold ${Number(systemHealth?.apiPerformance?.errorRate || 0) > 2 ? 'text-red-600' : Number(systemHealth?.apiPerformance?.errorRate || 0) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Number(systemHealth?.apiPerformance?.errorRate || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-6">
              <h4 className="mb-4 font-semibold text-slate-900">System Alerts</h4>
              <div className="space-y-3">
                {visibleHealthAlerts.map((alert, index) => (
                  <div key={`${alert.title}-${index}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-3">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${alert.level === 'critical' ? 'bg-red-500' : alert.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <div><p className="text-sm font-semibold text-slate-800">{alert.title}</p><p className="text-xs text-slate-600">{alert.detail}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SystemHealth;
