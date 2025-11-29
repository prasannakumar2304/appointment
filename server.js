
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*', // Configure this properly in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log('📍 Database:', mongoose.connection.name);
})
.catch((err) => {
  console.error('❌ MongoDB Connection Error:', err.message);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB Disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB Error:', err);
});

const apiRoutes = require('./api');

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Medicare API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      specialties: '/api/specialties',
      doctors: '/api/doctors',
      appointments: '/api/appointments/book'
    }
  });
});

// Mount API routes
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('🏥 ========================================');
  console.log('   MEDICARE API SERVER');
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}/api`);
  console.log(`💾 Database: ${mongoose.connection.name}`);
  console.log(`🔑 API Key Required: ${process.env.API_KEY ? 'Yes' : 'No'}`);
  console.log('========================================');
  console.log('');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT received, shutting down gracefully...');
  
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  
  process.exit(0);
});

module.exports = app;