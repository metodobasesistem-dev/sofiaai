/**
 * Agent API Routes — Backend proxy for agents table.
 *
 * All operations use service role key (bypasses RLS entirely).
 * Redis cache with 2-minute TTL reduces Supabase queries to near-zero.
 * JWT auth middleware ensures only the owner can access their agents.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { cacheWrap, invalidateCache, cacheKey, TTL } from '../lib/redisCache.js';
import multer from 'multer';
import { transcribeAudio, analyzeTranscription } from '../services/aiService.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require a valid Supabase JWT
router.use(requireAuth as any);

// ─── GET /api/v2/agents ───────────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const agents = await cacheWrap(
      cacheKey.agents(userId),
      TTL.AGENTS,
      async () => {
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      }
    );

    res.json({ success: true, data: agents });
  } catch (err: any) {
    console.error('[AgentAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents ──────────────────────────────────────────────────
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent created: ${data.id} for user ${userId}`);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    console.error('[AgentAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v2/agents/:id ───────────────────────────────────────────────
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  try {
    const { error } = await supabase
      .from('agents')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('user_id', userId); // Security: only own agents

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent updated: ${agentId}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/agents/:id/toggle ─────────────────────────────────────
router.patch('/:id/toggle', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  const { status_ativo } = req.body;

  try {
    // Deactivate all other agents first (only one can be active)
    if (status_ativo) {
      await supabase
        .from('agents')
        .update({ status_ativo: false })
        .eq('user_id', userId)
        .neq('id', agentId);
    }

    const { error } = await supabase
      .from('agents')
      .update({ status_ativo })
      .eq('id', agentId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] PATCH toggle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/agents/:id ────────────────────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;
  try {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', agentId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.agents(userId));
    console.log(`[AgentAPI] ✅ Agent deleted: ${agentId}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents/analyze-transcription ───────────────────────────────
router.post('/analyze-transcription', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isEnabled = await isFeatureEnabled('ai_followup_questions');
    if (!isEnabled) {
      return res.status(403).json({ success: false, error: 'Feature disabled' });
    }

    const userId = req.userId!;
    const { transcription } = req.body;

    if (!transcription) {
      return res.status(400).json({ success: false, error: 'Transcription is required' });
    }

    console.log(`[AgentAPI] 🔍 Analyzing transcription for user ${userId}...`);
    const questions = await analyzeTranscription(transcription, userId);
    res.json({ success: true, data: questions });
  } catch (err: any) {
    console.error('[AgentAPI] Analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents/simulate-chat ─────────────────────────────────────
router.post('/simulate-chat', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { agentData, messages } = req.body;

  try {
    const { agentService } = await import('../services/agentService.js');
    const result = await agentService.processChatSimulation(userId, agentData, messages);

    if (result.audioBuffer) {
      // If we have audio, we could send it as base64 or separate. 
      // For the preview, returning text + base64 audio is simple.
      res.json({ 
        success: true, 
        text: result.text, 
        audio: result.audioBuffer.toString('base64') 
      });
    } else {
      res.json({ success: true, text: result.text });
    }
  } catch (err: any) {
    console.error('[AgentAPI] Simulate chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents/transcribe ──────────────────────────────────────────
router.post('/transcribe', upload.single('audio'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, error: 'No audio file provided' });
  }

  try {
    console.log(`[AgentAPI] 🎤 Transcribing audio for user ${userId} (${file.size} bytes)`);
    const transcription = await transcribeAudio(file.buffer, file.originalname, userId);
    
    if (!transcription) {
      throw new Error('Transcription failed');
    }

    res.json({ success: true, text: transcription });
  } catch (err: any) {
    console.error('[AgentAPI] Transcription error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/agents/:id/knowledge ────────────────────────────────────────
router.get('/:id/knowledge', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;

  try {
    const { data, error } = await supabase
      .from('agent_knowledge')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[AgentAPI] GET knowledge error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/agents/:id/knowledge ───────────────────────────────────────
router.post('/:id/knowledge', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const agentId = req.params.id;

  try {
    // O agente precisa ser deste inquilino. Sem esta checagem, qualquer
    // usuário autenticado podia gravar um bloco de conhecimento no agente de
    // outro tenant — e o texto entraria no prompt da IA que atende os
    // clientes dele.
    const { data: agente } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!agente) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado' });
    }

    const { data, error } = await supabase
      .from('agent_knowledge')
      .insert({
        ...req.body,
        agent_id: agentId,
        user_id: userId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    console.error('[AgentAPI] POST knowledge error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v2/agents/:id/knowledge/:knowledgeId ──────────────────────────
router.put('/:id/knowledge/:knowledgeId', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { knowledgeId } = req.params;

  try {
    const { error } = await supabase
      .from('agent_knowledge')
      .update({
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .eq('id', knowledgeId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] PUT knowledge error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/v2/agents/:id/knowledge/:knowledgeId ───────────────────────
router.delete('/:id/knowledge/:knowledgeId', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { knowledgeId } = req.params;

  try {
    const { error } = await supabase
      .from('agent_knowledge')
      .delete()
      .eq('id', knowledgeId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('[AgentAPI] DELETE knowledge error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/agents/ai-stats ─────────────────────────────────────────────
// Retorna métricas agregadas de performance do agente de IA.
// range: '24h' | '7d' (default) | '30d'
router.get('/ai-stats', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const range = String(req.query.range || '7d');
    const since = new Date();
    if (range === '24h') since.setHours(since.getHours() - 24);
    else if (range === '30d') since.setDate(since.getDate() - 30);
    else since.setDate(since.getDate() - 7);

    const { data, error } = await supabase
      .from('ai_interaction_logs')
      .select('outcome, cost_brl, duration_ms, tokens_in, tokens_out, tool_names, created_at')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    const logs = data || [];
    const total = logs.length;

    const costTotal = logs.reduce((s, r) => s + Number(r.cost_brl || 0), 0);
    const tokensIn  = logs.reduce((s, r) => s + (r.tokens_in  || 0), 0);
    const tokensOut = logs.reduce((s, r) => s + (r.tokens_out || 0), 0);
    const avgDuration = total > 0
      ? Math.round(logs.reduce((s, r) => s + (r.duration_ms || 0), 0) / total)
      : 0;

    const outcomeCount: Record<string, number> = {};
    const toolCount: Record<string, number> = {};
    logs.forEach(r => {
      outcomeCount[r.outcome] = (outcomeCount[r.outcome] || 0) + 1;
      (r.tool_names || []).forEach((t: string) => { toolCount[t] = (toolCount[t] || 0) + 1; });
    });

    const topTools = Object.entries(toolCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Agrupamento diário para gráfico
    const dailyMap: Record<string, { total: number; cost: number }> = {};
    logs.forEach(r => {
      const day = r.created_at.substring(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { total: 0, cost: 0 };
      dailyMap[day].total++;
      dailyMap[day].cost = +(dailyMap[day].cost + Number(r.cost_brl || 0)).toFixed(6);
    });
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    const resolutionRate = total > 0
      ? Math.round(((outcomeCount['responded'] || 0) / total) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        total,
        cost_total: +costTotal.toFixed(4),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        avg_duration_ms: avgDuration,
        resolution_rate: resolutionRate,
        outcomes: outcomeCount,
        top_tools: topTools,
        daily
      }
    });
  } catch (err: any) {
    console.error('[AgentAPI] GET ai-stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
