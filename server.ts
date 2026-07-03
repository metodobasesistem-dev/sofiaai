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
process.on('uncaughtException', async (err) => {
  console.error('[Server] CRITICAL: Uncaught Exception:', err);
  try {
    const { monitoringService } = await import('./src/backend/services/monitoringService.js');
    await monitoringService.recordHeartbeat('server_core', 'error', {
      message: 'Uncaught Exception (Process Crash)',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
  } catch (e) {}
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Server] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    const { monitoringService } = await import('./src/backend/services/monitoringService.js');
    await monitoringService.recordHeartbeat('server_core', 'error', {
      message: 'Unhandled Promise Rejection',
      error: String(reason),
      timestamp: new Date().toISOString()
    });
  } catch (e) {}
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import services and routes statically to avoid loading hangs/circularity issues
import { supabase } from './src/backend/lib/supabaseClient.js';
import { redisService } from './src/backend/services/redisService.js';
import sessionRoutes from './src/backend/routes/sessionRoutes.js';
import messageRoutes from './src/backend/routes/messageRoutes.js';
import pushRoutes from './src/backend/routes/pushRoutes.js';
import { sessionController } from './src/backend/controllers/sessionController.js';
import { whatsappService } from './src/backend/services/whatsappService.js';
import { agentService } from './src/backend/services/agentService.js';
import { notificationService } from './src/backend/services/notificationService.js';

// V2 Professional API Routes
import agentApiRoutes from './src/backend/routes/agentApiRoutes.js';
import contactApiRoutes from './src/backend/routes/contactApiRoutes.js';
import profileApiRoutes from './src/backend/routes/profileApiRoutes.js';
import quickReplyApiRoutes from './src/backend/routes/quickReplyApiRoutes.js';
import adminApiRoutes from './src/backend/routes/adminApiRoutes.js';
import radarRoutes from './src/backend/routes/radarRoutes.js';
import campaignRoutes from './src/backend/routes/campaignRoutes.js';
import whatsappRoutes from './src/backend/routes/whatsappRoutes.js';
import whatsappWebhookRoutes from './src/backend/routes/whatsappWebhookRoutes.js';
import metaWebhookRoutes from './src/backend/routes/metaWebhookRoutes.js';
import metaApiRoutes from './src/backend/routes/metaApiRoutes.js';
import diagnosticsRoutes from './src/backend/routes/diagnosticsRoutes.js';
import { rPing } from './src/backend/lib/redisClient.js';
import leoRoutes from './src/backend/routes/leoRoutes.js';
import sofiaRoutes from './src/backend/routes/sofiaRoutes.js';
import stripeRoutes from './src/backend/routes/stripeRoutes.js';
import authEmailRoutes from './src/backend/routes/authEmailRoutes.js';
import { requireAuth, requireAdmin } from './src/backend/middleware/authMiddleware.js';
import { globalLimiter, apiLimiter, authLimiter, webhookLimiter, adminLimiter } from './src/backend/middleware/rateLimiter.js';



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
  app.set('trust proxy', 1); // Confia no primeiro proxy (Coolify/Nginx/Cloudflare)

  // rawBody é preservado para validação HMAC (ex.: X-Hub-Signature-256 do Meta webhook)
  app.use(express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));

  // WEBHOOK CRÍTICO: registrado ANTES do globalLimiter para garantir entrega
  // (Evolution API, Meta Cloud API e Leo Instagram dependem disso para receber mensagens)
  app.use('/api/whatsapp/evolution', webhookLimiter, whatsappWebhookRoutes);
  app.use('/api/whatsapp/meta', (req, res, next) => {
    console.log(`[Server] Webhook Request: ${req.method} ${req.url}`);
    next();
  }, metaWebhookRoutes);
  app.use('/api/leo', webhookLimiter, leoRoutes);

  app.use('/api/', globalLimiter); // Proteção global básica (após webhooks)

  // REGISTRO DE EMERGÊNCIA - TOPO DO SERVIDOR
  app.use('/api/v2/sofia', apiLimiter, sofiaRoutes);
  app.use('/api/v2/stripe', stripeRoutes);
  app.use('/api/auth', authEmailRoutes);
  
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

  // 🛡️ CHAT SYSTEM HEALTH CHECK — Valida todos os subsistemas críticos do chat
  // Monitore este endpoint externamente (Uptime Kuma, Betterstack, etc.)
  // para detectar regressões antes que os usuários reportem.
  app.get('/api/health/chat', async (req, res) => {
    const checks: Record<string, { ok: boolean; detail?: string; latencyMs?: number }> = {};
    const start = Date.now();

    // 1. Database — tabela messages acessível
    try {
      const t0 = Date.now();
      const { error } = await supabase.from('messages').select('id').limit(1);
      checks.db_messages = { ok: !error, latencyMs: Date.now() - t0, detail: error?.message };
    } catch (e: any) {
      checks.db_messages = { ok: false, detail: e.message };
    }

    // 2. Database — tabela threads acessível
    try {
      const t0 = Date.now();
      const { error } = await supabase.from('threads').select('id').limit(1);
      checks.db_threads = { ok: !error, latencyMs: Date.now() - t0, detail: error?.message };
    } catch (e: any) {
      checks.db_threads = { ok: false, detail: e.message };
    }

    // 3. Database — tabela contacts acessível
    try {
      const t0 = Date.now();
      const { error } = await supabase.from('contacts').select('id').limit(1);
      checks.db_contacts = { ok: !error, latencyMs: Date.now() - t0, detail: error?.message };
    } catch (e: any) {
      checks.db_contacts = { ok: false, detail: e.message };
    }

    // 4. Redis — cache e idempotência
    checks.redis = { ok: await rPing() };

    // 5. Mensagens travadas em "sending" (indica falha de persistência)
    try {
      const threshold = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // > 5 min
      const { data: stuck, error } = await supabase
        .from('messages')
        .select('id, created_at, user_id')
        .eq('status', 'sending')
        .lt('created_at', threshold)
        .limit(10);
      checks.stuck_messages = { 
        ok: !error && (stuck?.length ?? 0) === 0,
        detail: stuck?.length ? `${stuck.length} message(s) stuck in 'sending' status for >5min` : undefined
      };
    } catch (e: any) {
      checks.stuck_messages = { ok: false, detail: e.message };
    }

    // 6. Tenants Meta com erro recente (token expirado, qualidade ruim, etc)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: failingMeta, error } = await supabase
        .from('profiles')
        .select('id, email, meta_last_error')
        .eq('whatsapp_provider', 'meta_official')
        .not('meta_last_error', 'is', null)
        .gt('meta_last_error_at', oneHourAgo)
        .limit(5);
      checks.meta_tenants_healthy = {
        ok: !error && (failingMeta?.length ?? 0) === 0,
        detail: failingMeta?.length
          ? `${failingMeta.length} Meta tenant(s) with recent errors`
          : undefined,
      };
    } catch (e: any) {
      checks.meta_tenants_healthy = { ok: false, detail: e.message };
    }

    // 7. Threads sem mensagens (órfãs — indica falha no ciclo de persistência)
    try {
      const { data: orphans, error } = await supabase
        .from('threads')
        .select('id')
        .is('last_message', null)
        .limit(5);
      checks.orphan_threads = {
        ok: !error && (orphans?.length ?? 0) === 0,
        detail: orphans?.length ? `${orphans.length} thread(s) with no last_message` : undefined
      };
    } catch (e: any) {
      checks.orphan_threads = { ok: false, detail: e.message };
    }

    const allOk = Object.values(checks).every(c => c.ok);
    const totalMs = Date.now() - start;

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      totalLatencyMs: totalMs,
      checks
    });
  });

  // Public settings for maintenance/signups
  app.get('/api/v2/public-settings', async (req, res) => {
    try {
      const { data, error } = await supabase.from('global_settings')
        .select('allow_signups, support_whatsapp')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      res.json({ 
        success: true, 
        data: data || { allow_signups: true } 
      });
    } catch (err: any) {
      // Suprimir log para o erro esperado de coluna ausente (migration pendente).
      // A coluna allow_signups precisa ser adicionada via: 
      //   ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS allow_signups BOOLEAN NOT NULL DEFAULT true;
      const isMissingColumn = err.code === '42703' || err.message?.includes('allow_signups');
      if (!isMissingColumn) {
        console.warn('[Server] Public settings fetch failed (using defaults):', err.message);
      }
      res.json({ 
        success: true, 
        data: { allow_signups: true } 
      });
    }
  });

  // Diagnostic route to troubleshoot production issues (ADMIN ONLY)
  app.get('/api/diag/system', adminLimiter, requireAuth as any, requireAdmin as any, async (req, res) => {
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
    
    // API Routes are handled by separate router files
    app.use('/api/sessions', sessionRoutes);

    app.use('/api/messages', messageRoutes);

    app.post('/api/sessions/pairing-code', async (req, res) => {
      const { userId, phoneNumber } = req.body;
      if (!userId || !phoneNumber) return res.status(400).json({ error: 'Faltando userId ou phoneNumber' });

      try {
        const code = await whatsappService.requestPairingCode(userId, phoneNumber);
        res.json({ success: true, code });
      } catch (error: any) {
        console.error('[Server] pairing-code error:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // V2 Layered Architecture
    app.use('/api/v2/agents', agentApiRoutes);
    app.use('/api/v2/contacts', contactApiRoutes);
    app.use('/api/v2/profile', profileApiRoutes);
    app.use('/api/v2/quick-replies', quickReplyApiRoutes);
    app.use('/api/v2/admin', adminLimiter, adminApiRoutes);
    app.use('/api/v2/admin/diagnostics', adminLimiter, requireAuth as any, requireAdmin as any, diagnosticsRoutes);
    app.use('/api/v2/radar', apiLimiter, radarRoutes);
    app.use('/api/v2/campaigns', apiLimiter, campaignRoutes);
    app.use('/api/v2/push', pushRoutes);
    app.use('/api/whatsapp', whatsappRoutes);
    app.use('/api/v2/whatsapp/meta', apiLimiter, metaApiRoutes);
    // /api/whatsapp/evolution, /api/whatsapp/meta (webhook) e /api/leo registrados no topo (antes do globalLimiter)



    
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
    notificationService.startBackgroundJobs().catch(async (err) => {
      console.error('[Server] Notification service start error:', err);
      const { monitoringService } = await import('./src/backend/services/monitoringService.js');
      await monitoringService.recordHeartbeat('system_worker', 'error', {
        message: 'Notification Service failed to start',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    });

    // System Monitoring Cycle (BullMQ/Redis/DB)
    console.log('[Server] Starting System Health Monitor (60s cycle)...');
    setInterval(async () => {
      try {
        const { monitoringService } = await import('./src/backend/services/monitoringService.js');
        monitoringService.runSystemDiagnostics().catch(() => {});
      } catch (e) {}
    }, 60 * 1000);
    // Run first time
    const { monitoringService: ms } = await import('./src/backend/services/monitoringService.js');
    ms.runSystemDiagnostics().catch(() => {});

  } catch (err: any) {
    console.error('[Server] Error during background initialization:', err);
    try {
      const { monitoringService } = await import('./src/backend/services/monitoringService.js');
      await monitoringService.recordHeartbeat('server_core', 'error', {
        message: 'Background initialization failed',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    } catch (e) {}
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
