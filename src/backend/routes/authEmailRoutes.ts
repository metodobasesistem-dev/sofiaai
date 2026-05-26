import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { sendPasswordResetEmail, sendOtpEmail } from '../services/emailService.js';
import { rSet, rGet, rDel } from '../lib/redisClient.js';

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

/**
 * POST /api/auth/send-code
 * Gera um código OTP de 6 dígitos, armazena no Redis por 10 min e envia por e-mail.
 */
router.post('/send-code', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await rSet(`otp:${email}`, code, 600);
    await sendOtpEmail(email, code);
    console.log(`[OTP] Code sent to ${email}`);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[OTP] send-code error:', err?.message);
    return res.status(500).json({ error: 'Erro ao enviar código. Tente novamente.' });
  }
});

/**
 * POST /api/auth/verify-code
 * Valida o OTP, gera magic link via Supabase Admin e retorna o token_hash para o cliente.
 */
router.post('/verify-code', async (req: Request, res: Response) => {
  const { email, code } = req.body as { email?: string; code?: string };

  if (!email || !code) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  try {
    const stored = await rGet(`otp:${email}`);
    if (!stored || stored !== code.trim()) {
      return res.status(401).json({ error: 'Código inválido ou expirado.' });
    }

    await rDel(`otp:${email}`);

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.error('[OTP] generateLink error:', error?.message);
      return res.status(500).json({ error: 'Erro ao autenticar. Verifique se o e-mail está cadastrado.' });
    }

    console.log(`[OTP] Code verified for ${email}`);
    return res.status(200).json({ token_hash: data.properties.hashed_token });
  } catch (err: any) {
    console.error('[OTP] verify-code error:', err?.message);
    return res.status(500).json({ error: 'Erro ao verificar código.' });
  }
});

export default router;
