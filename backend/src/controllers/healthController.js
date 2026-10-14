/**
 * Health Check Controller
 * Reports Express server status and SQL Server database connectivity
 * Sanitized to avoid exposing internal SQL Server host or instance names.
 */

const { checkHealth } = require('../config/db');

async function getHealth(req, res) {
  try {
    const dbHealth = await checkHealth();
    
    const statusCode = dbHealth.connected ? 200 : 503;
    
    return res.status(statusCode).json({
      status: dbHealth.connected ? 'healthy' : 'degraded',
      service: 'SRC Bookstore Management System API',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: dbHealth.connected,
        status: dbHealth.connected ? 'online' : 'offline',
        latencyMs: dbHealth.latencyMs
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      service: 'SRC Bookstore Management System API',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        status: 'error'
      }
    });
  }
}

module.exports = {
  getHealth
};
