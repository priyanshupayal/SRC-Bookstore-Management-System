/**
 * Database Connection Module
 * Project: SRC Bookstore Management System
 * Driver: Microsoft SQL Server (mssql / tedious)
 */

const sql = require('mssql');
require('dotenv').config();

// Determine configuration from environment variables
const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  database: process.env.DB_NAME || 'SRC_Bookstore',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false', // Default to true for local/self-signed certs
    enableArithAbort: true,
    connectTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 15000,
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT, 10) || 15000
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    idleTimeoutMillis: 30000
  }
};

// If DB_USER is provided, use SQL Server authentication
if (process.env.DB_USER && process.env.DB_USER.trim() !== '') {
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD || '';
}

let poolPromise = null;

/**
 * Get or create singleton connection pool
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log('[SQL Server] Connection pool initialized successfully.');
        
        // Listen to pool errors
        pool.on('error', err => {
          console.error('[SQL Server Pool Error]:', err.message);
        });

        return pool;
      })
      .catch(err => {
        console.error('[SQL Server Connection Error]:', err.message);
        poolPromise = null; // Reset so next attempt can retry
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Check active database connectivity
 * @returns {Promise<{connected: boolean, latencyMs: number}>}
 */
async function checkHealth() {
  const start = Date.now();
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS [is_alive];');
    const latencyMs = Date.now() - start;
    return {
      connected: true,
      latencyMs
    };
  } catch (err) {
    return {
      connected: false,
      error: 'Database connection failed',
      latencyMs: Date.now() - start
    };
  }
}

/**
 * Graceful shutdown of connection pool
 */
async function closePool() {
  if (poolPromise) {
    try {
      const pool = await poolPromise;
      await pool.close();
      poolPromise = null;
      console.log('[SQL Server] Connection pool closed.');
    } catch (err) {
      console.error('[SQL Server] Error closing pool:', err.message);
    }
  }
}

module.exports = {
  sql,
  getPool,
  checkHealth,
  closePool
};
