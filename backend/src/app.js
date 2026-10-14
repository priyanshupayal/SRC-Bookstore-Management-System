/**
 * Express Application Configuration
 * SRC Bookstore Management System
 */

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // Allow local frontend dev server
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl !== '/api/health') {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root greeting endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SRC Bookstore Management System API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      dashboardStats: '/api/dashboard/stats',
      recentActivity: '/api/dashboard/recent-activity',
      inventory: '/api/inventory',
      categories: '/api/inventory/categories'
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error occurred.',
    message: err.message
  });
});

module.exports = app;
