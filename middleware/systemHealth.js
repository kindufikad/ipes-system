const fs = require('fs');
const os = require('os');
const path = require('path');
const pool = require('../config/db');
const { createDatabaseBackup } = require('../services/backupService');

const performanceStats = {
  requests: 0,
  requestsInWindow: [],
};

const pruneRequestWindow = () => {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  performanceStats.requestsInWindow = performanceStats.requestsInWindow.filter((request) => request.timestamp > oneMinuteAgo);
};

const responseTimeMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    performanceStats.requests += 1;
    performanceStats.requestsInWindow.push({ timestamp: Date.now(), duration, statusCode: Number(res.statusCode || 500) });
    pruneRequestWindow();
  });

  next();
};

const getDiskUsage = async () => {
  try {
    const stats = await fs.promises.statfs(process.cwd());
    const blockSize = Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * blockSize;
    const freeBytes = Number(stats.bavail) * blockSize;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes)) {
      throw new Error('Filesystem capacity is unavailable.');
    }
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    return {
      available: true,
      totalGb: Number((totalBytes / (1024 ** 3)).toFixed(2)),
      usedGb: Number((usedBytes / (1024 ** 3)).toFixed(2)),
      freeGb: Number((freeBytes / (1024 ** 3)).toFixed(2)),
      percentUsed: Number(((usedBytes / totalBytes) * 100).toFixed(1)),
    };
  } catch {
    return {
      available: false,
      totalGb: null,
      usedGb: null,
      freeGb: null,
      percentUsed: null,
    };
  }
};

const getLatestBackupFile = async (backupDirectory) => {
  try {
    if (!fs.existsSync(backupDirectory)) return null;
    const files = await fs.promises.readdir(backupDirectory, { withFileTypes: true });
    const backupFiles = files
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(backupDirectory, entry.name))
      .filter((filePath) => /\.sql$/i.test(filePath) || /\.sql\.gz$/i.test(filePath) || /\.bak$/i.test(filePath));

    if (!backupFiles.length) return null;
    const latestFile = await Promise.all(
      backupFiles.map(async (filePath) => {
        const stats = await fs.promises.stat(filePath);
        return { filePath, modifiedAt: stats.mtimeMs };
      })
    ).then((entries) => entries.sort((a, b) => b.modifiedAt - a.modifiedAt)[0]);

    return latestFile;
  } catch (error) {
    return null;
  }
};

const calculateUptime = () => {
  const totalSeconds = Math.max(0, Math.floor(process.uptime()));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    seconds: totalSeconds,
    formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    days,
    hours,
    minutes,
    seconds,
  };
};

const getSystemHealthSnapshot = async () => {
  const startLatency = Date.now();
  let databaseLatencyMs = 0;
  let databaseStatus = 'offline';
  let databaseMessage = 'Database connection unavailable';

  try {
    await pool.query('SELECT 1');
    databaseLatencyMs = Date.now() - startLatency;
    databaseStatus = databaseLatencyMs < 500 ? 'healthy' : 'degraded';
    databaseMessage = databaseLatencyMs < 500 ? 'Database is responsive.' : 'Database is responding slowly.';
  } catch (error) {
    databaseLatencyMs = 0;
    databaseStatus = 'offline';
    databaseMessage = error?.message || 'Database connection failed.';
  }

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const totalDisk = await getDiskUsage();
  const backupDirectory = path.join(__dirname, '..', 'backups');
  const latestBackup = await getLatestBackupFile(backupDirectory);
  const [backupRows] = await pool.query(`
    SELECT setting_key, setting_value
    FROM system_settings
    WHERE setting_key IN ('last_backup', 'backup_retention_days')
  `).catch(() => [ [] ]);
  const backupSettings = (backupRows || []).reduce((settings, row) => {
    settings[row.setting_key] = row.setting_value;
    return settings;
  }, {});
  const savedLastBackup = backupSettings.last_backup || null;
  const backupRetentionDays = Number.parseInt(backupSettings.backup_retention_days, 10) || 7;
  const lastBackupTimestamp = savedLastBackup || (latestBackup ? new Date(latestBackup.modifiedAt).toISOString() : null);

  pruneRequestWindow();
  const recentRequests = performanceStats.requestsInWindow;
  const requestsInLastMinute = recentRequests.length;
  const averageResponseTimeMs = requestsInLastMinute
    ? Number((recentRequests.reduce((total, request) => total + request.duration, 0) / requestsInLastMinute).toFixed(1))
    : 0;
  const errors4xx = recentRequests.filter((request) => request.statusCode >= 400 && request.statusCode < 500).length;
  const errors5xx = recentRequests.filter((request) => request.statusCode >= 500).length;
  const errorRate = requestsInLastMinute
    ? Number((((errors4xx + errors5xx) / requestsInLastMinute) * 100).toFixed(2))
    : 0;
  const memoryPercentUsed = Number(((usedMemory / totalMemory) * 100 || 0).toFixed(1));

  const alerts = [];
  if (!totalDisk.available) {
    alerts.push({ level: 'warning', title: 'Disk usage unavailable', detail: 'Filesystem capacity could not be read from the server.' });
  } else if (totalDisk.percentUsed >= 85) {
    alerts.push({ level: 'critical', title: 'Disk usage is high', detail: `Storage is ${totalDisk.percentUsed}% utilized.` });
  } else if (totalDisk.percentUsed >= 70) {
    alerts.push({ level: 'warning', title: 'Disk usage is elevated', detail: `Storage is ${totalDisk.percentUsed}% utilized.` });
  }

  if (memoryPercentUsed >= 90) {
    alerts.push({ level: 'critical', title: 'Memory usage is high', detail: `Memory is ${memoryPercentUsed}% utilized.` });
  } else if (memoryPercentUsed >= 80) {
    alerts.push({ level: 'warning', title: 'Memory usage is elevated', detail: `Memory is ${memoryPercentUsed}% utilized.` });
  }

  if (errorRate > 2) {
    alerts.push({ level: 'critical', title: 'API error rate elevated', detail: `Error rate is ${errorRate}% in the last minute.` });
  } else if (errorRate > 1) {
    alerts.push({ level: 'warning', title: 'API error rate trending up', detail: `Error rate is ${errorRate}% in the last minute.` });
  }

  if (databaseStatus === 'offline') {
    alerts.push({ level: 'critical', title: 'Database unavailable', detail: databaseMessage });
  } else if (databaseStatus === 'degraded') {
    alerts.push({ level: 'warning', title: 'Database latency elevated', detail: `Latency is ${databaseLatencyMs}ms.` });
  }

  const backupAgeDays = lastBackupTimestamp ? (Date.now() - new Date(lastBackupTimestamp).getTime()) / (24 * 60 * 60 * 1000) : null;
  if (backupAgeDays === null || !Number.isFinite(backupAgeDays)) {
    alerts.push({ level: 'warning', title: 'No database backup found', detail: 'Create a database backup to establish a recovery point.' });
  } else if (backupAgeDays >= backupRetentionDays) {
    alerts.push({ level: 'warning', title: 'Database backup is overdue', detail: `The latest backup is older than the ${backupRetentionDays}-day retention policy.` });
  }

  if (!alerts.length) {
    alerts.push({ level: 'healthy', title: 'All systems operational', detail: 'No critical issues detected.' });
  }

  return {
    status: alerts.some((alert) => ['critical', 'warning'].includes(alert.level)) ? 'degraded' : 'healthy',
    generatedAt: new Date().toISOString(),
    uptime: calculateUptime(),
    memory: {
      totalMb: Number((totalMemory / (1024 ** 2)).toFixed(1)),
      usedMb: Number((usedMemory / (1024 ** 2)).toFixed(1)),
      freeMb: Number((freeMemory / (1024 ** 2)).toFixed(1)),
      percentUsed: memoryPercentUsed,
    },
    cpu: {
      loadAverage: os.loadavg(),
      usagePercent: Number(Math.min(100, ((os.loadavg()[0] / Math.max(os.cpus().length || 1, 1)) * 100) || 0).toFixed(1)),
    },
    disk: totalDisk,
    database: {
      status: databaseStatus,
      latencyMs: databaseLatencyMs,
      lastBackup: lastBackupTimestamp ? new Date(lastBackupTimestamp).toISOString() : null,
      backupRetentionDays,
      message: databaseMessage,
    },
    apiPerformance: {
      averageResponseTimeMs,
      requestsPerMinute: requestsInLastMinute,
      totalRequests: performanceStats.requests,
      errorRate,
      errorCounts: {
        fourXX: errors4xx,
        fiveXX: errors5xx,
      },
    },
    alerts,
  };
};

const triggerDatabaseBackup = async () => {
  return createDatabaseBackup();
};

module.exports = {
  responseTimeMiddleware,
  getSystemHealthSnapshot,
  triggerDatabaseBackup,
};
