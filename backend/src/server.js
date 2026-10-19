/**
 * Server Entry Point
 * SRC Bookstore Management System
 * Binds strictly to localhost for local demonstration security
 */

const app = require('./app');
const { checkHealth, closePool } = require('./config/db');
require('dotenv').config();

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, async () => {
  console.log('================================================================');
  console.log(`SRC Bookstore Backend running securely on: http://${HOST}:${PORT}`);
  console.log('Verifying SQL Server database connection pool...');
  console.log('================================================================');

  try {
    const health = await checkHealth();
    if (health.connected) {
      console.log(`[Database Ready] Status: Online (${health.latencyMs}ms latency)`);
    } else {
      console.warn(`[Database Warning] Could not connect: ${health.error}`);
    }
  } catch (err) {
    console.error('[Database Error] Startup connection check failed:', err.message);
  }
});

// Graceful process termination
const handleShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await closePool();
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
