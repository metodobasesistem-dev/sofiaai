import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const router = Router();

/**
 * POST /api/auth/forgot-password
 * Gera um link de redefinição de senha via Supabase Admin API e envia pelo Resend.
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  try {
    const redirectTo = process.env.APP_URL || 'https://sofia.zyreo.com.br';

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error) {
      // Não revelamos se o e-mail existe ou não (segurança)
      console.warn('[AuthEmail] generateLink error (silent):', error.message);
      return res.status(200).json({ ok: true });
    }

    const resetLink = data.properties?.action_link;
    if (!resetLink) {
      console.error('[AuthEmail] No action_link returned');
      return res.status(200).json({ ok: true });
    }

    await sendPasswordResetEmail(email, resetLink);
    console.log(`[AuthEmail] Password reset sent to ${email}`);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[AuthEmail] Unexpected error:', err?.message);
    // Sempre retorna 200 para não revelar se o e-mail existe
    return res.status(200).json({ ok: true });
  }
});

export default router;
