import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { initializeDatabase, closeDatabase } from './database';
import { apiLimiter, authLimiter, uploadLimiter, paymentLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import printersRoutes from './routes/printers';
import { emailService } from './utils/emailService';
import { db } from './database';
import { getPrinterStatus } from './services/printerControl';

// Load environment variables (support backend/.env when launched from repo root)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Initialize database
initializeDatabase();

// Initialize email service with settings from database
try {
  const org = db.prepare('SELECT settings FROM organizations WHERE id = ?').get(1) as any;
  if (org && org.settings) {
    const settings = JSON.parse(org.settings);
    if (settings.email) {
      emailService.initialize(settings.email);
    }
  }
} catch (error) {
  console.log('Email service initialization skipped - no settings found');
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting (important for production behind reverse proxy)
app.set('trust proxy', 1);

// Middleware
const defaultOrigins = ['http://localhost:5173', 'http://localhost:8080'];
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// Health check endpoint (no rate limit)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Print Farm Orchestrator API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/*',
      jobs: '/api/jobs/*',
      files: '/api/files/*',
      queue: '/api/queue/*',
      printers: '/api/printers/*',
      organizations: '/api/organizations/*',
      subscriptions: '/api/subscriptions/*',
      analytics: '/api/analytics/*',
      whitelist: '/api/whitelist/*',
      email: '/api/email/*'
    }
  });
});

// Import new route handlers
import jobsRoutes from './routes/jobs';
import filesRoutes from './routes/files';
import queueRoutes from './routes/queue';
import workhoursRoutes from './routes/workhours';
import organizationsRoutes from './routes/organizations';
import subscriptionsRoutes from './routes/subscriptions';
import samlRoutes from './routes/saml';
import analyticsRoutes from './routes/analytics';
import whitelistRoutes from './routes/whitelist';
import emailRoutes from './routes/email';

// Mount route handlers with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/printers', printersRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/files', uploadLimiter, filesRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/workhours', workhoursRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/subscriptions', paymentLimiter, subscriptionsRoutes);
app.use('/api/saml', samlRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whitelist', whitelistRoutes);
app.use('/api/email', emailRoutes);

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      // Handle different message types
      switch (data.type) {
        case 'subscribe:jobs':
          // Subscribe client to job updates
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'jobs' }));
          break;
        case 'subscribe:printers':
          // Subscribe client to printer updates
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'printers' }));
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  // Send initial connection success message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Print Farm Orchestrator'
  }));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📝 Default credentials:`);
  console.log(`   Username: admin`);
  console.log(`   Password: admin123`);
  console.log(`   ⚠️  Change the password immediately!\n`);
});

const refreshPrintersOnBoot = async () => {
  try {
    const printers = db
      .prepare("SELECT id FROM printers WHERE integration_type IS NOT NULL AND is_active = 1")
      .all() as Array<{ id: string }>;

    for (const printer of printers) {
      try {
        await getPrinterStatus(printer.id);
      } catch (error) {
        // Ignore individual printer failures.
      }
    }
  } catch (error) {
    // Ignore refresh failures.
  }
};

// Auto-connect printers on startup and keep status updated.
setTimeout(() => {
  refreshPrintersOnBoot();
  setInterval(refreshPrintersOnBoot, 15000);
}, 2000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    closeDatabase();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    closeDatabase();
    process.exit(0);
  });
});
