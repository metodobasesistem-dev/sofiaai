import dotenv from 'dotenv';
import fs from 'fs';
if (!process.env.SUPABASE_URL) {
  if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
  } else {
    dotenv.config();
  }
}

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Global error handlers to prevent process crashes from background dependencies
process.on('uncaughtException', (err) => {
  console.error('[Server] CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import services and routes statically to avoid loading hangs/circularity issues
import { supabase } from './src/backend/lib/supabaseClient.js';
import { redisService } from './src/backend/services/redisService.js';
import sessionRoutes from './src/backend/routes/sessionRoutes.js';
import messageRoutes from './src/backend/routes/messageRoutes.js';
import { sessionController } from './src/backend/controllers/sessionController.js';
import { whatsappService } from './src/backend/services/whatsappService.js';
import { agentService } from './src/backend/services/agentService.js';
import { notificationService } from './src/backend/services/notificationService.js';

// V2 Professional API Routes
import agentApiRoutes from './src/backend/routes/agentApiRoutes.js';
import contactApiRoutes from './src/backend/routes/contactApiRoutes.js';
import profileApiRoutes from './src/backend/routes/profileApiRoutes.js';
import { rPing } from './src/backend/lib/redisClient.js';

async function startServer() {
  console.log('[Server] Starting server version 3.0 (Supabase)...');
  const app = express();
  const PORT = process.env.PORT || 3000;

  // 0. Listen Early
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] FATAL: Port ${PORT} is already in use. Please close other terminals or processes.`);
      process.exit(1);
    }
  });

  // 1. Middleware
  app.use(express.json());

  // 2. Health Checks
  app.get('/api/health-check', async (req, res) => {
    const redisOk = await rPing();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      db: 'supabase',
      redis: redisOk ? 'ok' : 'failed'
    });
  });

  // Diagnostic route to troubleshoot production issues
  app.get('/api/diag/system', async (req, res) => {
    const mask = (str?: string) => str ? `${str.substring(0, 5)}...${str.substring(str.length - 4)}` : 'MISSING';
    
    const diag = {
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      supabase: {
        url: mask(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
        anon_key: mask(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
        service_role: mask(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
      },
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent']?.substring(0, 20)
      }
    };

    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(1).single();
      (diag as any).db_connection = error ? `Error: ${error.message}` : 'OK';
    } catch (e: any) {
      (diag as any).db_connection = `Exception: ${e.message}`;
    }

    res.json(diag);
  });

  // 3. Register Routes
  try {
    console.log('[Server] Registering API Routes...');
    
    // Session creation (Direct Controller call)
    app.post('/api/sessions/create', async (req, res) => {
      try {
        await sessionController.createSession(req, res);
      } catch (err: any) {
        console.error('[Server] Error in direct session create:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    });

    app.use('/api/sessions', sessionRoutes);
    app.use('/api/messages', messageRoutes);

    // V2 Layered Architecture
    app.use('/api/v2/agents', agentApiRoutes);
    app.use('/api/v2/contacts', contactApiRoutes);
    app.use('/api/v2/profile', profileApiRoutes);
    
    console.log('[Server] All API Routes Registered (v1 & v2)');

  } catch (err: any) {
    console.error('[Server] Error during route registration:', err);
  }

  // 4. Initialize Core Services (Background)
  try {
    console.log('[Server] Initializing WhatsApp Service...');
    setTimeout(() => {
      whatsappService.initializeAllSessions().catch(err => {
        console.error('[Server] WhatsApp init background error:', err);
      });
    }, 2000);

    console.log('[Server] Checking AI Services...');
    if (process.env.OPENAI_API_KEY) {
      console.log('[Server] OpenAI API Key detected');
    }

    console.log('[Server] Starting Notification Background Jobs...');
    notificationService.startBackgroundJobs().catch(err => {
      console.error('[Server] Notification service start error:', err);
    });
  } catch (err) {
    console.error('[Server] Error during background initialization:', err);
  }

  // Catch-all for undefined API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // 5. Frontend Serving
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    console.log(`[Server] Searching for static files in: ${distPath}`);
    
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log('[Server] Production mode: Serving static files from /dist');
    } else {
      console.error(`[Server] ❌ FATAL ERROR: /dist folder not found at ${distPath}`);
      console.log('[Server] Current directory content:', fs.readdirSync(__dirname));
      
      // Fallback for debugging: show a simple message instead of 404
      app.get('/', (req, res) => {
        res.status(500).send(`Server is running, but /dist folder is missing at ${distPath}. Build might have failed.`);
      });
    }
  } else {
    // Vite Middleware (Development only)
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Development mode: Vite middleware active');
  }

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
    try {
      await whatsappService.destroyAll();
    } catch (err) {
      console.error('[Server] Error during WhatsApp shutdown:', err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(err => {
  console.error('[Server] FATAL ERROR during startServer:', err);
  process.exit(1);
});
