const {
  getDatabaseHealth: getAdminDatabaseHealth,
  getSystemHealth: getAdminSystemHealth,
} = require('./adminController');

const getDatabaseHealth = async (req, res) => {
  try {
    return await getAdminDatabaseHealth(req, res);
  } catch (error) {
    console.error('systemAdminController.getDatabaseHealth failed:', error);
    return res.status(503).json({
      success: false,
      message: 'Database health check could not complete.',
      data: { status: 'Offline', checkedAt: new Date().toISOString() },
    });
  }
};

const getSystemHealth = async (req, res) => {
  try {
    return await getAdminSystemHealth(req, res);
  } catch (error) {
    console.error('systemAdminController.getSystemHealth failed:', error);
    return res.status(200).json({
      success: true,
      message: 'System health is temporarily unavailable; returning safe fallback data.',
      data: {
        status: 'degraded',
        generatedAt: new Date().toISOString(),
        uptime: { formatted: '0d 0h 0m 0s' },
        database: { status: 'offline', latencyMs: 0, lastBackup: null },
        apiPerformance: { averageResponseTimeMs: 0, requestsPerMinute: 0, errorRate: 0 },
        alerts: [{ level: 'warning', title: 'System health fallback', detail: 'The health snapshot could not be generated.' }],
      },
    });
  }
};

module.exports = {
  getDatabaseHealth,
  getSystemHealth,
};
