import { Router } from 'express';
import { sofiaService } from '../services/sofiaService.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/authMiddleware.js';
import { supabase } from '../lib/supabaseClient.js';

const router = Router();

/**
 * Get chat history with Sofia
 */
router.get('/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Get tenant_id from profile
    const { data: profile } = await supabase.from('profiles')
      .select('tenant_id')
      .eq('id', req.userId!)
      .single();

    if (!profile?.tenant_id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const history = await sofiaService.getHistory(profile.tenant_id);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send a message to Sofia
 */
router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const { data: profile } = await supabase.from('profiles')
      .select('tenant_id')
      .eq('id', req.userId!)
      .single();

    if (!profile?.tenant_id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const response = await sofiaService.chat(req.userId!, profile.tenant_id, message);
    res.json({ response });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
